"""Unit tests for ``custom_components.meshcore_chat.message_store``.

Phase 4B of the HA Quality + Best Practices Remediation. Covers the
behavioral guarantees of the MessageStore class plus the module-level
``_backfill_messages`` migration helper:

1. ``_backfill_messages`` performs three in-place migrations on stored
   records (rx_log enrichment, stuck-pending promotion, DM
   ``rx_log_data`` synth) and is idempotent across re-runs.
2. ``store_message`` appends, dedupes by id, and FIFO-trims at the
   per-conversation cap.
3. ``update_message_delivery`` and ``update_message_rx_data`` mutate
   only the matched record (newest-first match).
4. ``update_message_delivery_any`` performs a cross-conversation scan
   and returns the entity_id of the conversation hosting the message
   (or None when no match).
5. ``cleanup_old_messages`` prunes by retention threshold for both
   cached and non-cached conversations, dropping empty index entries.
6. ``_evict_idle`` removes conversations from ``_loaded_conversations``
   once their last-access age exceeds
   ``MESSAGE_STORE_IDLE_EVICTION_SECONDS``.
7. ``search`` matches against text and sender, honors date-range
   bounds, and supports both scoped and cross-conversation queries.

The MessageStore is instantiated directly with a ``MockConfigEntry``;
PHACC's ``hass_storage`` fixture intercepts ``homeassistant.helpers.
storage.Store`` writes so no temporary directory is needed. Each test
calls ``await store.async_unload()`` (or relies on a fixture that
does so) to cancel debounced timers and avoid lingering TimerHandle
warnings.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any

import pytest
from homeassistant.core import HomeAssistant

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.meshcore_chat.const import (
    MESSAGE_STORE_IDLE_EVICTION_SECONDS,
    OPT_MAX_MESSAGES_PER_CONVERSATION,
    OPT_MESSAGE_RETENTION_DAYS,
)
from custom_components.meshcore_chat.message_store import (
    MessageStore,
    _backfill_messages,
)

DOMAIN = "meshcore_chat"


# ─── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def config_entry(hass: HomeAssistant) -> MockConfigEntry:
    """A registered MockConfigEntry with default (empty) options."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="MeshCore Chat",
        entry_id="01TEST_ENTRY",
        data={},
        options={},
    )
    entry.add_to_hass(hass)
    return entry


@pytest.fixture
async def store(hass: HomeAssistant, config_entry: MockConfigEntry):
    """A loaded MessageStore ready for write/read operations."""
    s = MessageStore(hass, config_entry)
    await s.async_load_index()
    yield s
    await s.async_unload()


# ─── _backfill_messages ────────────────────────────────────────────────


def test_backfill_enriches_rx_log_path_nodes_and_hop_count() -> None:
    """rx_log entries with path/path_len gain path_nodes/hop_count."""
    msg = {
        "id": "m1",
        "rx_log_data": [{"path": "ab12cd34", "path_len": 4}],
    }
    assert _backfill_messages([msg]) is True
    rx = msg["rx_log_data"][0]
    assert rx["path_nodes"] == ["ab", "12", "cd", "34"]
    assert rx["hop_count"] == 4


def test_backfill_uses_path_hash_size_when_present() -> None:
    """rx_log path with explicit path_hash_size splits at that width."""
    msg = {
        "id": "m1a",
        "rx_log_data": [{"path": "b00b0e57867d", "path_len": 3, "path_hash_size": 2}],
    }
    assert _backfill_messages([msg]) is True
    assert msg["rx_log_data"][0]["path_nodes"] == ["b00b", "0e57", "867d"]


def test_backfill_derives_two_byte_width_without_path_hash_size() -> None:
    """Without path_hash_size, width is derived from len(path)/path_len."""
    msg = {
        "id": "m1b",
        "rx_log_data": [{"path": "b00b0e57867d", "path_len": 3}],
    }
    assert _backfill_messages([msg]) is True
    rx = msg["rx_log_data"][0]
    assert rx["path_nodes"] == ["b00b", "0e57", "867d"]
    assert rx["hop_count"] == 3


def test_backfill_promotes_stuck_pending_with_rx_log_data() -> None:
    """Outgoing pending message with rx_log_data is promoted to sent."""
    msg = {
        "id": "m2",
        "outgoing": True,
        "delivery_status": "pending",
        "rx_log_data": [{"hop_count": 2, "synthesized": False}],
    }
    assert _backfill_messages([msg]) is True
    assert msg["delivery_status"] == "sent"


def test_backfill_promotes_with_repeater_count_only() -> None:
    """Promotion path also fires when ``repeater_count`` > 0 and no rx_log."""
    msg = {
        "id": "m3",
        "outgoing": True,
        "delivery_status": "pending",
        "repeater_count": 1,
    }
    assert _backfill_messages([msg]) is True
    assert msg["delivery_status"] == "sent"


def test_backfill_synthesizes_rx_log_data_for_dm_with_hop_count() -> None:
    """DM with top-level hop_count but no rx_log_data gets a synth entry."""
    msg = {"id": "m4", "hop_count": 3, "snr": -7, "rssi": -90}
    assert _backfill_messages([msg]) is True
    assert msg["rx_log_data"] == [
        {"hop_count": 3, "synthesized": True, "snr": -7, "rssi": -90}
    ]


def test_backfill_is_idempotent() -> None:
    """A second pass over already-migrated records returns False."""
    msg = {
        "id": "m5",
        "outgoing": True,
        "delivery_status": "pending",
        "rx_log_data": [{"path": "ab", "path_len": 1}],
    }
    assert _backfill_messages([msg]) is True
    assert _backfill_messages([msg]) is False


def test_backfill_skips_non_dict_entries() -> None:
    """Defensive: non-dict items in messages list are skipped silently."""
    items: list[Any] = [None, "not a message", 42]
    assert _backfill_messages(items) is False


# ─── store_message ─────────────────────────────────────────────────────


async def test_store_message_appends_and_indexes(store: MessageStore) -> None:
    """First store_message creates the conversation and indexes it."""
    msg = {
        "id": "a1",
        "timestamp": "2026-05-01T10:00:00",
        "sender": "Alice",
        "text": "hello",
    }
    await store.store_message("binary_sensor.alice", msg)

    cached = await store._ensure_loaded("binary_sensor.alice")
    assert cached == [msg]
    idx = store.get_message_index()
    assert idx["binary_sensor.alice"]["message_count"] == 1
    assert idx["binary_sensor.alice"]["last_sender"] == "Alice"
    assert idx["binary_sensor.alice"]["last_preview"] == "hello"


async def test_store_message_dedupes_by_id(store: MessageStore) -> None:
    """Storing the same message id twice keeps a single record."""
    msg = {
        "id": "dup",
        "timestamp": "2026-05-01T10:00:00",
        "sender": "Bob",
        "text": "hi",
    }
    await store.store_message("binary_sensor.bob", msg)
    await store.store_message("binary_sensor.bob", msg)
    cached = await store._ensure_loaded("binary_sensor.bob")
    assert len(cached) == 1


async def test_store_message_sorts_by_timestamp(
    store: MessageStore,
) -> None:
    """Messages stored out of order land in chronological position.

    Drift fix (Change 0 of "Last-Read Anchor and Read-Receipt
    Refinement for Chat Panel"). Real-world trigger: a delayed mesh
    event arrives after a more recent event has already been stored.
    Without bisect-insert, ``messages[-1]`` would be the most-recently-
    inserted message rather than the chronologically newest, breaking
    cursor / lazy-load semantics added in Phases 1+.
    """
    eid = "binary_sensor.drift"
    await store.store_message(
        eid,
        {"id": "t0", "timestamp": "2026-05-01T10:00:00", "sender": "x", "text": "first"},
    )
    await store.store_message(
        eid,
        {"id": "t2", "timestamp": "2026-05-01T10:02:00", "sender": "x", "text": "third"},
    )
    # Delayed event with timestamp BETWEEN the two already-stored.
    await store.store_message(
        eid,
        {"id": "t1", "timestamp": "2026-05-01T10:01:00", "sender": "x", "text": "second"},
    )
    cached = await store._ensure_loaded(eid)
    assert [m["id"] for m in cached] == ["t0", "t1", "t2"]


async def test_store_message_dedup_uses_chronological_window(
    store: MessageStore,
) -> None:
    """Dedup window is the newest-50-by-timestamp after Change 0.

    Verifies R6c from the proposal: ``messages[-50:]`` previously meant
    "the 50 most-recently-inserted records," which could let a duplicate
    of a delayed event slip through if it arrived after a flood of
    newer events. Post-Change-0, the dedup window is chronological, so
    a re-arriving delayed event is still caught.

    Sequence: store A (T0), then B (T-1, simulating a delayed event
    that lands AFTER A even though its timestamp is OLDER), then A
    again. Assert the second A is dedupped — i.e., the buffer still
    contains exactly two records and A is not duplicated.
    """
    eid = "binary_sensor.dedup"
    msg_a = {
        "id": "a",
        "timestamp": "2026-05-01T10:00:00",
        "sender": "x",
        "text": "alpha",
    }
    msg_b_delayed = {
        "id": "b",
        "timestamp": "2026-05-01T09:59:00",  # earlier than A
        "sender": "x",
        "text": "beta (delayed)",
    }
    await store.store_message(eid, msg_a)
    await store.store_message(eid, msg_b_delayed)
    # Re-store A — must be dedupped even though B (an older-timestamp
    # event) was the most recent INSERT.
    await store.store_message(eid, msg_a)
    cached = await store._ensure_loaded(eid)
    assert [m["id"] for m in cached] == ["b", "a"]


async def test_get_messages_returns_newest_after_drift(
    store: MessageStore,
) -> None:
    """``get_messages(limit=1)`` returns the chronologically newest record.

    Phase 1 cursor snapshotting (``ws_mark_read``) calls
    ``get_messages(limit=1)`` to find the newest message ID. After
    Change 0, that contract holds even when events arrive out of
    order: ``messages[-limit:]`` is the newest N by timestamp, not by
    insertion order.
    """
    eid = "binary_sensor.newest"
    await store.store_message(
        eid,
        {"id": "t1", "timestamp": "2026-05-01T10:00:00", "sender": "x", "text": "one"},
    )
    await store.store_message(
        eid,
        {"id": "t3", "timestamp": "2026-05-01T10:02:00", "sender": "x", "text": "three"},
    )
    # Delayed event with timestamp BETWEEN t1 and t3 — most recent
    # insert, but NOT the chronologically newest.
    await store.store_message(
        eid,
        {"id": "t2", "timestamp": "2026-05-01T10:01:00", "sender": "x", "text": "two"},
    )
    newest = await store.get_messages(eid, limit=1)
    assert len(newest) == 1
    assert newest[0]["id"] == "t3"
    # Index should also reflect the chronologically newest message.
    assert store.get_message_index()[eid]["last_message_ts"] == "2026-05-01T10:02:00"
    assert store.get_message_index()[eid]["last_preview"] == "three"


async def test_store_message_fifo_trims_at_max(
    hass: HomeAssistant, config_entry: MockConfigEntry
) -> None:
    """Exceeding ``max_messages_per_conversation`` trims oldest first."""
    hass.config_entries.async_update_entry(
        config_entry, options={OPT_MAX_MESSAGES_PER_CONVERSATION: 3}
    )
    s = MessageStore(hass, config_entry)
    await s.async_load_index()
    try:
        for i in range(5):
            await s.store_message(
                "binary_sensor.cap",
                {
                    "id": f"m{i}",
                    "timestamp": f"2026-05-01T10:0{i}:00",
                    "sender": "n",
                    "text": f"msg {i}",
                },
            )
        cached = await s._ensure_loaded("binary_sensor.cap")
        assert [m["id"] for m in cached] == ["m2", "m3", "m4"]
        assert s.get_message_index()["binary_sensor.cap"]["message_count"] == 3
    finally:
        await s.async_unload()


# ─── _ensure_loaded backfill on first load ─────────────────────────────


async def test_ensure_loaded_runs_backfill_on_first_load(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    hass_storage: dict,
) -> None:
    """Records loaded for the first time are migrated in-place."""
    storage_key = (
        f"meshcore_chat.{config_entry.entry_id}.msgs.binary_sensor_alice"
    )
    hass_storage[storage_key] = {
        "version": 1,
        "minor_version": 1,
        "key": storage_key,
        "data": [
            {
                "id": "old1",
                "outgoing": True,
                "delivery_status": "pending",
                "repeater_count": 1,
            }
        ],
    }
    s = MessageStore(hass, config_entry)
    await s.async_load_index()
    try:
        loaded = await s._ensure_loaded("binary_sensor.alice")
        # stuck-pending promotion fires on first load.
        assert loaded[0]["delivery_status"] == "sent"
        assert "binary_sensor.alice" in s._conversation_dirty
    finally:
        await s.async_unload()


# ─── count_unread_after (Cursor-Derived Unread Count, Phase 1) ─────────


async def _seed_alpha_beta(store: MessageStore, eid: str) -> None:
    """Seed five chronological messages with mixed inbound/outgoing."""
    msgs = [
        {"id": "m1", "timestamp": "2026-05-01T10:00:00", "outgoing": False, "sender": "Alice", "text": "in1"},
        {"id": "m2", "timestamp": "2026-05-01T10:01:00", "outgoing": True,  "sender": "Me",    "text": "out1"},
        {"id": "m3", "timestamp": "2026-05-01T10:02:00", "outgoing": False, "sender": "Alice", "text": "in2"},
        {"id": "m4", "timestamp": "2026-05-01T10:03:00", "outgoing": False, "sender": "Alice", "text": "in3"},
        {"id": "m5", "timestamp": "2026-05-01T10:04:00", "outgoing": True,  "sender": "Me",    "text": "out2"},
    ]
    for m in msgs:
        await store.store_message(eid, m)


async def test_count_unread_after_with_no_cursor_counts_all_inbound(
    store: MessageStore,
) -> None:
    """``cursor_id=None`` returns the total inbound count.

    Fresh-install / never-read fallback. Inbound = ``not outgoing``;
    out of 5 seeded messages, 3 are inbound (m1, m3, m4).
    """
    eid = "binary_sensor.fresh"
    await _seed_alpha_beta(store, eid)
    assert await store.count_unread_after(eid, None) == 3


async def test_count_unread_after_with_cursor_counts_strictly_newer(
    store: MessageStore,
) -> None:
    """Cursor at m2 → m3 and m4 are newer inbound (m5 is outgoing)."""
    eid = "binary_sensor.cursor"
    await _seed_alpha_beta(store, eid)
    # m2 is the cursor; m3, m4 are newer inbound; m5 is newer outgoing.
    assert await store.count_unread_after(eid, "m2") == 2


async def test_count_unread_after_returns_zero_when_cursor_at_tail(
    store: MessageStore,
) -> None:
    """Cursor at the chronologically-newest message → 0 unread.

    R6 in the proposal: an outgoing message stored after a fully-read
    state must not bump the badge. m5 is the newest message; counting
    after m5 returns 0 regardless of m5's outgoing status.
    """
    eid = "binary_sensor.tail"
    await _seed_alpha_beta(store, eid)
    assert await store.count_unread_after(eid, "m5") == 0


async def test_count_unread_after_orphan_cursor_falls_back_to_all_inbound(
    store: MessageStore,
) -> None:
    """Cursor not found in store → fallback to all-inbound count.

    R1 in the proposal: matches the divider's anchor-not-found path
    so the badge and the divider stay consistent. A pruned-or-orphaned
    cursor produces the same all-inbound count as a never-read
    conversation; cosmetically the badge inflates after extreme
    retention pruning, which is correct (1000+ messages have arrived
    since the last read).
    """
    eid = "binary_sensor.orphan"
    await _seed_alpha_beta(store, eid)
    assert await store.count_unread_after(eid, "msg_does_not_exist") == 3


async def test_count_unread_after_filters_outgoing(
    store: MessageStore,
) -> None:
    """Outgoing messages never count, regardless of cursor.

    Pin the ``not m.get('outgoing', False)`` filter — matches the
    legacy in-memory counter's behavior of incrementing only on
    inbound (R6).
    """
    eid = "binary_sensor.outgoing"
    # Three outgoing-only messages.
    for i, ts in enumerate(("10:00", "10:01", "10:02")):
        await store.store_message(
            eid,
            {
                "id": f"o{i}",
                "timestamp": f"2026-05-01T{ts}:00",
                "outgoing": True,
                "sender": "Me",
                "text": f"out{i}",
            },
        )
    assert await store.count_unread_after(eid, None) == 0
    assert await store.count_unread_after(eid, "o0") == 0


async def test_count_unread_after_treats_missing_outgoing_as_inbound(
    hass: HomeAssistant, config_entry: MockConfigEntry
) -> None:
    """Defensive: a record without an ``outgoing`` field counts as inbound.

    The legacy counter relied on ``not record["outgoing"]`` (KeyError
    on missing). ``count_unread_after`` uses the more defensive
    ``not m.get("outgoing", False)``: missing → False → counted as
    inbound. Semantically matches the legacy ``not False`` branch and
    hardens against future callers that omit the field.
    """
    s = MessageStore(hass, config_entry)
    await s.async_load_index()
    try:
        # Bypass store_message so we don't normalize the record.
        eid = "binary_sensor.legacy"
        s._loaded_conversations[eid] = [
            {"id": "x1", "timestamp": "2026-05-01T10:00:00"},  # no `outgoing`
            {"id": "x2", "timestamp": "2026-05-01T10:01:00", "outgoing": True},
        ]
        # x1 is treated as inbound; x2 as outgoing → count_unread_after(None) == 1.
        assert await s.count_unread_after(eid, None) == 1
        # Cursor at x1 → only x2 newer, which is outgoing → 0.
        assert await s.count_unread_after(eid, "x1") == 0
    finally:
        await s.async_unload()


# ─── update_message_delivery / _rx_data ────────────────────────────────


async def test_update_message_delivery_finds_record(
    store: MessageStore,
) -> None:
    """update_message_delivery sets status + merges kwargs on the right record."""
    await store.store_message(
        "binary_sensor.eve",
        {
            "id": "u1",
            "timestamp": "2026-05-01T10:00:00",
            "sender": "Eve",
            "text": "first",
            "delivery_status": "pending",
        },
    )
    await store.store_message(
        "binary_sensor.eve",
        {
            "id": "u2",
            "timestamp": "2026-05-01T10:01:00",
            "sender": "Eve",
            "text": "second",
            "delivery_status": "pending",
        },
    )
    await store.update_message_delivery(
        "binary_sensor.eve", "u1", "delivered", attempt=2
    )
    cached = await store._ensure_loaded("binary_sensor.eve")
    by_id = {m["id"]: m for m in cached}
    assert by_id["u1"]["delivery_status"] == "delivered"
    assert by_id["u1"]["attempt"] == 2
    # u2 is unaffected.
    assert by_id["u2"]["delivery_status"] == "pending"


async def test_update_message_rx_data_sets_repeater_count(
    store: MessageStore,
) -> None:
    """update_message_rx_data sets rx_log_data and recomputes repeater_count."""
    await store.store_message(
        "binary_sensor.eve",
        {
            "id": "rx1",
            "timestamp": "2026-05-01T10:00:00",
            "sender": "Eve",
            "text": "trace me",
        },
    )
    rx = [{"hop_count": 1}, {"hop_count": 2}]
    await store.update_message_rx_data("binary_sensor.eve", "rx1", rx)
    cached = await store._ensure_loaded("binary_sensor.eve")
    assert cached[0]["rx_log_data"] == rx
    assert cached[0]["repeater_count"] == 2


async def test_update_message_delivery_no_match_is_noop(
    store: MessageStore,
) -> None:
    """Updating a missing id silently no-ops (no exception raised)."""
    await store.store_message(
        "binary_sensor.eve",
        {"id": "real", "timestamp": "t", "sender": "x", "text": "y"},
    )
    await store.update_message_delivery(
        "binary_sensor.eve", "ghost", "delivered"
    )
    cached = await store._ensure_loaded("binary_sensor.eve")
    assert cached[0]["id"] == "real"
    assert "delivery_status" not in cached[0]


# ─── update_message_delivery_any ───────────────────────────────────────


async def test_update_message_delivery_any_finds_across_conversations(
    store: MessageStore,
) -> None:
    """Cross-conversation scan locates the matching message and updates."""
    await store.store_message(
        "binary_sensor.alpha",
        {"id": "a", "timestamp": "t1", "sender": "A", "text": "..."},
    )
    await store.store_message(
        "binary_sensor.beta",
        {"id": "b", "timestamp": "t2", "sender": "B", "text": "..."},
    )
    found = await store.update_message_delivery_any(
        "b", "delivered", final=True
    )
    assert found == "binary_sensor.beta"
    cached = await store._ensure_loaded("binary_sensor.beta")
    assert cached[0]["delivery_status"] == "delivered"
    assert cached[0]["final"] is True


async def test_update_message_delivery_any_returns_none_when_missing(
    store: MessageStore,
) -> None:
    """No matching id anywhere → returns None and leaves all records intact."""
    await store.store_message(
        "binary_sensor.alpha",
        {"id": "a", "timestamp": "t1", "sender": "A", "text": "..."},
    )
    found = await store.update_message_delivery_any(
        "nonexistent", "delivered"
    )
    assert found is None


# ─── cleanup_old_messages ──────────────────────────────────────────────


async def test_cleanup_old_messages_prunes_cached_path(
    hass: HomeAssistant, config_entry: MockConfigEntry
) -> None:
    """Cached conversations are pruned in-place; index reflects new count."""
    hass.config_entries.async_update_entry(
        config_entry, options={OPT_MESSAGE_RETENTION_DAYS: 1}
    )
    s = MessageStore(hass, config_entry)
    await s.async_load_index()
    try:
        old_ts = (datetime.now() - timedelta(days=5)).isoformat()
        new_ts = datetime.now().isoformat()
        await s.store_message(
            "binary_sensor.x",
            {"id": "old", "timestamp": old_ts, "sender": "x", "text": "old"},
        )
        await s.store_message(
            "binary_sensor.x",
            {"id": "new", "timestamp": new_ts, "sender": "x", "text": "new"},
        )
        # Conversation is now in _loaded_conversations (cached path).
        assert "binary_sensor.x" in s._loaded_conversations
        await s.cleanup_old_messages()
        cached = s._loaded_conversations["binary_sensor.x"]
        assert [m["id"] for m in cached] == ["new"]
        assert s.get_message_index()["binary_sensor.x"]["message_count"] == 1
    finally:
        await s.async_unload()


async def test_cleanup_old_messages_prunes_non_cached_path(
    hass: HomeAssistant,
    config_entry: MockConfigEntry,
    hass_storage: dict,
) -> None:
    """Non-cached conversations are loaded transiently, pruned, saved."""
    hass.config_entries.async_update_entry(
        config_entry, options={OPT_MESSAGE_RETENTION_DAYS: 1}
    )
    old_ts = (datetime.now() - timedelta(days=10)).isoformat()
    new_ts = datetime.now().isoformat()
    eid = "binary_sensor.y"
    safe = eid.replace(".", "_")
    conv_key = f"meshcore_chat.{config_entry.entry_id}.msgs.{safe}"
    index_key = f"meshcore_chat.{config_entry.entry_id}.message_index"
    hass_storage[conv_key] = {
        "version": 1,
        "minor_version": 1,
        "key": conv_key,
        "data": [
            {"id": "stale", "timestamp": old_ts, "sender": "y", "text": "old"},
            {"id": "fresh", "timestamp": new_ts, "sender": "y", "text": "new"},
        ],
    }
    hass_storage[index_key] = {
        "version": 1,
        "minor_version": 1,
        "key": index_key,
        "data": {
            eid: {
                "message_count": 2,
                "last_message_ts": new_ts,
                "last_sender": "y",
                "last_preview": "new",
            }
        },
    }
    s = MessageStore(hass, config_entry)
    await s.async_load_index()
    try:
        # Conversation is NOT in _loaded_conversations.
        assert eid not in s._loaded_conversations
        await s.cleanup_old_messages()
        # Storage now contains only the fresh message; index count = 1.
        saved = hass_storage[conv_key]["data"]
        assert [m["id"] for m in saved] == ["fresh"]
        assert s.get_message_index()[eid]["message_count"] == 1
        # Still not cached after the non-cached prune path.
        assert eid not in s._loaded_conversations
    finally:
        await s.async_unload()


async def test_cleanup_drops_index_entry_when_emptied(
    hass: HomeAssistant, config_entry: MockConfigEntry
) -> None:
    """Conversation with all messages older than retention is removed from index."""
    hass.config_entries.async_update_entry(
        config_entry, options={OPT_MESSAGE_RETENTION_DAYS: 1}
    )
    s = MessageStore(hass, config_entry)
    await s.async_load_index()
    try:
        old_ts = (datetime.now() - timedelta(days=5)).isoformat()
        await s.store_message(
            "binary_sensor.empty",
            {"id": "g1", "timestamp": old_ts, "sender": "z", "text": "gone"},
        )
        await s.cleanup_old_messages()
        assert "binary_sensor.empty" not in s.get_message_index()
    finally:
        await s.async_unload()


# ─── idle eviction ─────────────────────────────────────────────────────


async def test_evict_idle_drops_stale_conversation(
    store: MessageStore,
) -> None:
    """Conversations whose last_access is older than the window are evicted."""
    await store.store_message(
        "binary_sensor.idle",
        {"id": "x", "timestamp": "t", "sender": "s", "text": "..."},
    )
    assert "binary_sensor.idle" in store._loaded_conversations
    # Simulate the conversation having been idle longer than the threshold.
    store._conversation_last_access["binary_sensor.idle"] = (
        time.time() - MESSAGE_STORE_IDLE_EVICTION_SECONDS - 10
    )
    await store._evict_idle()
    assert "binary_sensor.idle" not in store._loaded_conversations


async def test_evict_idle_keeps_recently_accessed(
    store: MessageStore,
) -> None:
    """Recently-accessed conversations remain in the cache."""
    await store.store_message(
        "binary_sensor.fresh",
        {"id": "y", "timestamp": "t", "sender": "s", "text": "..."},
    )
    # last_access was just set inside store_message → still fresh.
    await store._evict_idle()
    assert "binary_sensor.fresh" in store._loaded_conversations


# ─── search ─────────────────────────────────────────────────────────────


async def test_search_matches_text_and_sender(store: MessageStore) -> None:
    """search() returns hits on either text or sender; entity_id is added."""
    await store.store_message(
        "binary_sensor.alpha",
        {
            "id": "1",
            "timestamp": "2026-04-30T10:00:00",
            "sender": "Alice",
            "text": "find this rabbit",
        },
    )
    await store.store_message(
        "binary_sensor.alpha",
        {
            "id": "2",
            "timestamp": "2026-04-30T10:05:00",
            "sender": "rabbit_user",
            "text": "unrelated",
        },
    )
    await store.store_message(
        "binary_sensor.alpha",
        {
            "id": "3",
            "timestamp": "2026-04-30T10:10:00",
            "sender": "Bob",
            "text": "no match",
        },
    )
    hits = await store.search("rabbit")
    assert {h["id"] for h in hits} == {"1", "2"}
    assert all(h["entity_id"] == "binary_sensor.alpha" for h in hits)


async def test_search_honors_date_range(store: MessageStore) -> None:
    """from_date/to_date bounds exclude messages outside the window."""
    await store.store_message(
        "binary_sensor.r",
        {
            "id": "old",
            "timestamp": "2026-04-01T00:00:00",
            "sender": "x",
            "text": "rabbit gone",
        },
    )
    await store.store_message(
        "binary_sensor.r",
        {
            "id": "mid",
            "timestamp": "2026-04-15T00:00:00",
            "sender": "x",
            "text": "rabbit here",
        },
    )
    await store.store_message(
        "binary_sensor.r",
        {
            "id": "new",
            "timestamp": "2026-05-01T00:00:00",
            "sender": "x",
            "text": "rabbit too late",
        },
    )
    hits = await store.search(
        "rabbit",
        from_date="2026-04-10T00:00:00",
        to_date="2026-04-20T00:00:00",
    )
    assert [h["id"] for h in hits] == ["mid"]


async def test_search_scoped_vs_cross_conversation(
    store: MessageStore,
) -> None:
    """entity_id arg scopes the search to a single conversation."""
    await store.store_message(
        "binary_sensor.left",
        {"id": "L", "timestamp": "t1", "sender": "x", "text": "needle"},
    )
    await store.store_message(
        "binary_sensor.right",
        {"id": "R", "timestamp": "t2", "sender": "x", "text": "needle"},
    )
    cross = await store.search("needle")
    assert {h["id"] for h in cross} == {"L", "R"}
    scoped = await store.search("needle", entity_id="binary_sensor.left")
    assert {h["id"] for h in scoped} == {"L"}
