"""Unit tests for ``custom_components.meshcore_chat.__init__``.

Phase 4C of the HA Quality + Best Practices Remediation. Covers the
event-handler dispatch surface — the four ``hass.bus`` listeners
registered by ``async_setup_entry`` and the small support helpers
(``_resolve_store``, ``_store_message_id``, ``_async_options_updated``,
``async_unload_entry``).

Tests follow the 4A/4B direct-instantiation pattern: a
``MockConfigEntry`` is registered against ``hass`` with its
``runtime_data`` populated by hand to a ``MeshCoreChatRuntimeData``
holding a mocked ``MessageStore``. The handler factory functions are
called directly to obtain the closures, which are then invoked with a
hand-built ``Event`` object. ``async_setup_entry`` itself is not
exercised here — it transitively requires HA's full dependency setup
(frontend, http, websocket_api, meshcore) which is not available in
the PHACC sandbox; the four behavioral branches that matter live in
the closures the factories return, which we exercise directly.
"""
from __future__ import annotations

import hashlib
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.core import Event, HomeAssistant
from homeassistant.helpers import issue_registry as ir

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.meshcore_chat import (
    MeshCoreChatRuntimeData,
    _async_options_updated,
    _make_connection_state_handler,
    _make_delivery_update_handler,
    _make_message_handler,
    _resolve_store,
    _store_message_id,
    _sync_upstream_repair_issue,
    _upstream_meshcore_present,
    async_unload_entry,
)
from custom_components.meshcore_chat.const import DOMAIN, MESHCORE_DOMAIN

# ─── Fixtures ──────────────────────────────────────────────────────────


def _make_event(data: dict) -> Event:
    """Build a minimal Event-like object for handler invocation.

    The handlers only ever read ``event.data`` — building a real
    ``Event`` requires an event-bus binding we don't need in tests.
    """
    return SimpleNamespace(data=data)


@pytest.fixture
def mock_store() -> MagicMock:
    """A MessageStore stand-in with the four handler-touched coroutines."""
    s = MagicMock()
    s.store_message = AsyncMock()
    s.update_message_delivery = AsyncMock()
    s.update_message_rx_data = AsyncMock()
    s.update_message_delivery_any = AsyncMock(return_value=None)
    s.cleanup_old_messages = AsyncMock()
    s.async_unload = AsyncMock()
    return s


@pytest.fixture
def config_entry(
    hass: HomeAssistant, mock_store: MagicMock
) -> MockConfigEntry:
    """Registered MockConfigEntry with runtime_data wired to mock_store."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="MeshCore Chat",
        entry_id="01TEST_ENTRY",
        data={},
        options={},
    )
    entry.add_to_hass(hass)
    # runtime_data is the post-2024.6 Bronze pattern (Phase 2 migration).
    entry.runtime_data = MeshCoreChatRuntimeData(store=mock_store)
    return entry


# ─── _store_message_id helper ──────────────────────────────────────────


def test_store_message_id_prefers_id() -> None:
    """``id`` field wins over message_id and send_id."""
    assert _store_message_id({"id": "x", "message_id": "y", "send_id": "z"}) == "x"


def test_store_message_id_falls_back_to_message_id() -> None:
    assert _store_message_id({"message_id": "y", "send_id": "z"}) == "y"


def test_store_message_id_falls_back_to_send_id() -> None:
    assert _store_message_id({"send_id": "z"}) == "z"


def test_store_message_id_returns_none_when_absent() -> None:
    assert _store_message_id({}) is None


# ─── _resolve_store ────────────────────────────────────────────────────


def test_resolve_store_returns_runtime_store(
    hass: HomeAssistant, config_entry: MockConfigEntry, mock_store: MagicMock
) -> None:
    """When runtime_data is the right shape, the inner store is returned."""
    assert _resolve_store(hass, config_entry.entry_id) is mock_store


def test_resolve_store_returns_none_for_unknown_entry(
    hass: HomeAssistant,
) -> None:
    """Unknown entry id → None, no exception."""
    assert _resolve_store(hass, "doesnotexist") is None


def test_resolve_store_returns_none_when_runtime_data_wrong_shape(
    hass: HomeAssistant,
) -> None:
    """An entry whose runtime_data is not the expected dataclass returns None."""
    entry = MockConfigEntry(domain=DOMAIN, title="x", data={}, options={})
    entry.add_to_hass(hass)
    entry.runtime_data = "not the right type"  # type: ignore[assignment]
    assert _resolve_store(hass, entry.entry_id) is None


# ─── _make_message_handler ─────────────────────────────────────────────


async def test_message_handler_persists_event(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """meshcore_message → MessageStore.store_message with a built record."""
    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "id": "m1",
        "entity_id": "binary_sensor.alice",
        "sender_name": "Alice",
        "message": "hello",
        "timestamp": "2026-05-01T10:00:00",
        "outgoing": False,
    }))
    mock_store.store_message.assert_awaited_once()
    eid, record = mock_store.store_message.await_args.args
    assert eid == "binary_sensor.alice"
    assert record["id"] == "m1"
    assert record["sender"] == "Alice"
    assert record["text"] == "hello"
    # Inbound messages get default delivery_status="sent".
    assert record["delivery_status"] == "sent"


async def test_message_handler_skips_when_no_entity_id(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """No entity_id → no write (we don't know which conversation to use)."""
    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({"id": "m1", "message": "x"}))
    mock_store.store_message.assert_not_called()


async def test_message_handler_skips_when_store_missing(
    hass: HomeAssistant, mock_store: MagicMock
) -> None:
    """Unknown entry id → handler is a no-op (no AttributeError)."""
    handler = _make_message_handler(hass, "nonexistent_entry")
    await handler(_make_event({
        "entity_id": "binary_sensor.x",
        "id": "m",
        "message": "y",
    }))
    mock_store.store_message.assert_not_called()


async def test_message_handler_synthesizes_missing_id_via_sha(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """No id/message_id/send_id → sha256(timestamp|sender|text)[:12]."""
    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "entity_id": "binary_sensor.alice",
        "timestamp": "2026-05-01T10:00:00",
        "sender_name": "Alice",
        "message": "hi",
        "outgoing": False,
    }))
    mock_store.store_message.assert_awaited_once()
    record = mock_store.store_message.await_args.args[1]
    expected = hashlib.sha256(
        b"2026-05-01T10:00:00|Alice|hi"
    ).hexdigest()[:12]
    assert record["id"] == expected


async def test_message_handler_synthesizes_dm_rx_log_data(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """DM with top-level hop_count + snr → rx_log_data synth entry."""
    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "entity_id": "binary_sensor.dm",
        "id": "m1",
        "message": "ping",
        "timestamp": "t",
        "hop_count": 2,
        "snr": -7,
    }))
    record = mock_store.store_message.await_args.args[1]
    assert record["rx_log_data"] == [
        {"hop_count": 2, "synthesized": True, "snr": -7}
    ]


async def test_message_handler_skips_synth_when_rx_log_present(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Channel-message with rx_log_data already populated → no synth."""
    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "entity_id": "binary_sensor.chan",
        "id": "m1",
        "message": "x",
        "timestamp": "t",
        "hop_count": 1,
        "rx_log_data": [{"hop_count": 1}],
    }))
    record = mock_store.store_message.await_args.args[1]
    # Untouched — only one entry, the original one.
    assert len(record["rx_log_data"]) == 1


async def test_message_handler_outgoing_with_ack_marks_delivered(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Outgoing + ack_received=True → delivery_status defaults to 'delivered'."""
    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "entity_id": "binary_sensor.dm",
        "id": "m1",
        "message": "ping",
        "timestamp": "t",
        "outgoing": True,
        "ack_received": True,
    }))
    record = mock_store.store_message.await_args.args[1]
    assert record["delivery_status"] == "delivered"


async def test_message_handler_outgoing_without_ack_marks_sent(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Outgoing + no ack → 'sent' (the post-4s upstream emit is the source of truth)."""
    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "entity_id": "binary_sensor.dm",
        "id": "m1",
        "message": "ping",
        "timestamp": "t",
        "outgoing": True,
    }))
    record = mock_store.store_message.await_args.args[1]
    assert record["delivery_status"] == "sent"


async def test_message_handler_inbound_increments_unread_tracker(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Inbound (non-outgoing) messages mark the conversation unread."""
    tracker = MagicMock()
    tracker.mark_unread = AsyncMock()
    hass.data.setdefault(DOMAIN, {})["unread_tracker"] = tracker

    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "entity_id": "binary_sensor.alice",
        "id": "m1",
        "message": "hi",
        "timestamp": "t",
        "outgoing": False,
    }))
    tracker.mark_unread.assert_awaited_once_with("binary_sensor.alice")


async def test_message_handler_outgoing_does_not_increment_unread(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Outgoing messages must not bump the unread counter."""
    tracker = MagicMock()
    tracker.mark_unread = AsyncMock()
    hass.data.setdefault(DOMAIN, {})["unread_tracker"] = tracker

    handler = _make_message_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "entity_id": "binary_sensor.alice",
        "id": "m1",
        "message": "hi",
        "timestamp": "t",
        "outgoing": True,
    }))
    tracker.mark_unread.assert_not_called()


# ─── _make_delivery_update_handler ─────────────────────────────────────


async def test_delivery_handler_with_explicit_status_and_entity_id(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Explicit delivery_status + entity_id → update_message_delivery on that conv."""
    handler = _make_delivery_update_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "id": "m1",
        "entity_id": "binary_sensor.alice",
        "delivery_status": "delivered",
        "ack_received": True,
    }))
    mock_store.update_message_delivery.assert_awaited_once()
    args, kwargs = mock_store.update_message_delivery.await_args
    assert args == ("binary_sensor.alice", "m1", "delivered")
    assert kwargs.get("ack_received") is True


async def test_delivery_handler_progressive_only_writes_rx_log(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """progressive=True with rx_log_data → only update_message_rx_data is called."""
    handler = _make_delivery_update_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "id": "m1",
        "entity_id": "binary_sensor.alice",
        "progressive": True,
        "rx_log_data": [{"path": "ab", "path_len": 1}],
    }))
    mock_store.update_message_delivery.assert_not_called()
    mock_store.update_message_rx_data.assert_awaited_once()


async def test_delivery_handler_falls_back_to_cross_conversation_scan(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """No entity_id on the event → update_message_delivery_any (pre-PR-B path)."""
    mock_store.update_message_delivery_any = AsyncMock(
        return_value="binary_sensor.found"
    )
    handler = _make_delivery_update_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "id": "m1",
        "ack_received": True,
        "rx_log_data": [{"hop_count": 1}],
    }))
    mock_store.update_message_delivery_any.assert_awaited_once()
    # Located conversation gets the rx_data update too.
    mock_store.update_message_rx_data.assert_awaited_once()
    assert (
        mock_store.update_message_rx_data.await_args.args[0]
        == "binary_sensor.found"
    )


async def test_delivery_handler_skips_when_no_id(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Event with no message id → no-op."""
    handler = _make_delivery_update_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "entity_id": "binary_sensor.alice",
        "delivery_status": "delivered",
    }))
    mock_store.update_message_delivery.assert_not_called()
    mock_store.update_message_delivery_any.assert_not_called()


async def test_delivery_handler_skips_when_store_missing(
    hass: HomeAssistant, mock_store: MagicMock
) -> None:
    """Unknown entry id → handler is a silent no-op."""
    handler = _make_delivery_update_handler(hass, "nonexistent_entry")
    await handler(_make_event({"id": "m1", "delivery_status": "delivered"}))
    mock_store.update_message_delivery.assert_not_called()


async def test_delivery_handler_status_pending_when_no_ack(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Non-progressive event with no explicit status & no ack → 'pending'."""
    handler = _make_delivery_update_handler(hass, config_entry.entry_id)
    await handler(_make_event({
        "id": "m1",
        "entity_id": "binary_sensor.x",
    }))
    args, _ = mock_store.update_message_delivery.await_args
    assert args[2] == "pending"


# ─── _make_connection_state_handler ────────────────────────────────────


def test_connection_state_handler_is_callable_no_op(
    hass: HomeAssistant, config_entry: MockConfigEntry
) -> None:
    """connected/disconnected handlers are stubs — call must not raise."""
    on = _make_connection_state_handler(hass, config_entry.entry_id, connected=True)
    off = _make_connection_state_handler(hass, config_entry.entry_id, connected=False)
    # Neither raises.
    on(_make_event({}))
    off(_make_event({}))


# ─── _async_options_updated ────────────────────────────────────────────


async def test_options_updated_re_runs_cleanup(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Options-flow update → MessageStore.cleanup_old_messages re-runs."""
    await _async_options_updated(hass, config_entry)
    mock_store.cleanup_old_messages.assert_awaited_once()


async def test_options_updated_silent_when_store_missing(
    hass: HomeAssistant,
) -> None:
    """Runtime-data of the wrong type → options-update is a silent no-op."""
    entry = MockConfigEntry(domain=DOMAIN, title="x", data={}, options={})
    entry.add_to_hass(hass)
    # Set runtime_data to a non-RuntimeData value to exercise the defensive
    # ``isinstance`` guard in ``_resolve_store`` without tripping the
    # MockConfigEntry-doesn't-define-runtime_data AttributeError.
    entry.runtime_data = None  # type: ignore[assignment]
    await _async_options_updated(hass, entry)  # must not raise


# ─── async_unload_entry ─────────────────────────────────────────────────


async def test_unload_entry_clears_tracker_when_last_entry(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    mock_store: MagicMock,
) -> None:
    """Last-entry unload → tracker.clear() runs and store.async_unload awaited."""
    tracker = MagicMock()
    tracker.clear = MagicMock()
    bucket = hass.data.setdefault(DOMAIN, {})
    bucket["unread_tracker"] = tracker
    # The panel-registered guard must not trip the panel-removal path
    # (no panel was actually registered in this minimal test).
    bucket["_panel_registered"] = False

    result = await async_unload_entry(hass, config_entry)
    assert result is True
    mock_store.async_unload.assert_awaited_once()
    tracker.clear.assert_called_once()


async def test_unload_entry_returns_true_with_no_runtime_data(
    hass: HomeAssistant,
) -> None:
    """An entry whose runtime_data isn't our dataclass still unloads cleanly."""
    entry = MockConfigEntry(domain=DOMAIN, title="x", data={}, options={})
    entry.add_to_hass(hass)
    # Defensive guard: ``runtime = entry.runtime_data; if isinstance(...)``.
    # Set it to None so attribute access works but the isinstance check fails.
    entry.runtime_data = None  # type: ignore[assignment]
    result = await async_unload_entry(hass, entry)
    assert result is True


# ─── _upstream_meshcore_present ────────────────────────────────────────


def test_upstream_meshcore_present_false_when_data_missing(
    hass: HomeAssistant,
) -> None:
    """No MESHCORE_DOMAIN key in hass.data → False."""
    hass.data.pop(MESHCORE_DOMAIN, None)
    assert _upstream_meshcore_present(hass) is False


def test_upstream_meshcore_present_false_when_data_empty_dict(
    hass: HomeAssistant,
) -> None:
    """MESHCORE_DOMAIN key present but empty dict → False.

    This is the upstream-was-removed-at-runtime case: upstream's unload
    pops its coordinator entry but leaves the bucket dict in place.
    """
    hass.data[MESHCORE_DOMAIN] = {}
    assert _upstream_meshcore_present(hass) is False


def test_upstream_meshcore_present_true_when_populated(
    hass: HomeAssistant,
) -> None:
    """At least one entry under MESHCORE_DOMAIN → True."""
    hass.data[MESHCORE_DOMAIN] = {"entry": object()}
    assert _upstream_meshcore_present(hass) is True


# ─── _sync_upstream_repair_issue ───────────────────────────────────────


def _has_repair_issue(hass: HomeAssistant) -> bool:
    """True iff the upstream_meshcore_unavailable issue is registered."""
    issue = ir.async_get(hass).async_get_issue(
        DOMAIN, "upstream_meshcore_unavailable"
    )
    return issue is not None


def test_sync_creates_issue_when_upstream_absent(
    hass: HomeAssistant,
) -> None:
    """No upstream → call creates the issue."""
    hass.data.pop(MESHCORE_DOMAIN, None)
    assert not _has_repair_issue(hass)
    _sync_upstream_repair_issue(hass)
    assert _has_repair_issue(hass)


def test_sync_deletes_issue_when_upstream_returns(
    hass: HomeAssistant,
) -> None:
    """Issue exists, upstream returns → call deletes it."""
    # Pre-state: issue exists, upstream absent.
    hass.data.pop(MESHCORE_DOMAIN, None)
    _sync_upstream_repair_issue(hass)
    assert _has_repair_issue(hass)
    # Upstream returns.
    hass.data[MESHCORE_DOMAIN] = {"entry": object()}
    _sync_upstream_repair_issue(hass)
    assert not _has_repair_issue(hass)


def test_sync_no_op_when_present_and_no_issue(
    hass: HomeAssistant,
) -> None:
    """Upstream present + no existing issue → call leaves registry empty."""
    hass.data[MESHCORE_DOMAIN] = {"entry": object()}
    _sync_upstream_repair_issue(hass)
    assert not _has_repair_issue(hass)


def test_sync_no_op_when_absent_and_issue_already_present(
    hass: HomeAssistant,
) -> None:
    """Upstream absent + issue already present → call is a no-op (idempotent)."""
    hass.data.pop(MESHCORE_DOMAIN, None)
    _sync_upstream_repair_issue(hass)
    assert _has_repair_issue(hass)
    # Second call with the same state — issue should still exist (single entry).
    _sync_upstream_repair_issue(hass)
    assert _has_repair_issue(hass)


def test_sync_idempotent_under_50x_loop_absent(
    hass: HomeAssistant,
) -> None:
    """Risk 1 verification: 50x calls with upstream absent → exactly 1 issue.

    HA's issue registry dedupes by (domain, issue_id); repeated
    create-issue calls with the same key are no-ops, so the panel-
    polling rate is safe even at high frequency.
    """
    hass.data.pop(MESHCORE_DOMAIN, None)
    for _ in range(50):
        _sync_upstream_repair_issue(hass)
    # Exactly one entry registered for our (DOMAIN, issue_id).
    registry = ir.async_get(hass)
    issues = [
        i for i in registry.issues.values()
        if i.domain == DOMAIN
        and i.issue_id == "upstream_meshcore_unavailable"
    ]
    assert len(issues) == 1


def test_sync_idempotent_under_50x_loop_present(
    hass: HomeAssistant,
) -> None:
    """50x calls with upstream present → registry stays empty.

    delete-on-non-existent is a no-op in HA's issue registry, so the
    repeated delete-issue calls are safe under high panel-polling rate.
    """
    hass.data[MESHCORE_DOMAIN] = {"entry": object()}
    for _ in range(50):
        _sync_upstream_repair_issue(hass)
    registry = ir.async_get(hass)
    issues = [
        i for i in registry.issues.values()
        if i.domain == DOMAIN
        and i.issue_id == "upstream_meshcore_unavailable"
    ]
    assert len(issues) == 0
