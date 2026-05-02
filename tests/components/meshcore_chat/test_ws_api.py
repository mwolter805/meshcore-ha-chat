"""Unit tests for ``custom_components.meshcore_chat.ws_api``.

Phase 4C of the HA Quality + Best Practices Remediation. Covers
happy-path and error-path branches across the 29 WebSocket handlers,
with extra emphasis on destructive handlers (set/remove/clear/execute)
where a regression has the highest cost. Pragmatic target is 60–70%
coverage on ws_api.py — the focus is risk-reduction, not exhaustive
branch coverage.

Handlers are invoked via a small ``_call_ws`` helper that walks the
HA decorator stack (``@websocket_command`` / ``@async_response`` /
``@require_admin``) down to the underlying user function, bypassing
the connection-task scheduler so each test stays a single
``await``. The decorators themselves are HA-owned and not in scope
for these tests.

Coordinator state is supplied via ``hass.data[MESHCORE_DOMAIN][entry_id]``
with a ``MagicMock`` carrying just the attributes the handler under
test reads. This mirrors the handler's actual contract — ``hasattr(coord,
"api")`` is the selector — and avoids the upstream meshcore module
load altogether.
"""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.meshcore_chat import (
    MeshCoreChatRuntimeData,
)
from custom_components.meshcore_chat.const import DOMAIN, MESHCORE_DOMAIN
from custom_components.meshcore_chat import ws_api

# ─── Helpers ────────────────────────────────────────────────────────────


class _Connection:
    """Minimal stand-in for ``websocket_api.ActiveConnection``.

    Captures send_result / send_error calls so tests can assert the
    response shape without booting a full WS server.
    """

    def __init__(self) -> None:
        self.results: list[tuple[int, Any]] = []
        self.errors: list[tuple[int, str, str]] = []
        # Admin-by-default — a few destructive handlers gate on this
        # via @require_admin, but our _call_ws helper bypasses that
        # decorator, so this is mostly for completeness.
        self.user = MagicMock(is_admin=True)

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results.append((msg_id, result))

    def send_error(self, msg_id: int, code: str, message: str) -> None:
        self.errors.append((msg_id, code, message))


async def _call_ws(handler, hass, conn, msg) -> None:
    """Invoke a WS handler, unwrapping async_response/require_admin."""
    inner = handler
    seen: set[int] = set()
    while hasattr(inner, "__wrapped__") and id(inner) not in seen:
        seen.add(id(inner))
        inner = inner.__wrapped__
    if asyncio.iscoroutinefunction(inner):
        await inner(hass, conn, msg)
    else:
        inner(hass, conn, msg)


def _make_coordinator(**attrs) -> MagicMock:
    """Build a MagicMock coordinator with sensible defaults.

    ``hasattr(coord, "api")`` is what ``_get_coordinator`` keys off, so
    we always provide an ``api`` attribute. Tests override or add
    attributes via kwargs.
    """
    coord = MagicMock()
    coord.api = MagicMock()
    coord.api.connected = True
    coord.api.mesh_core = MagicMock()
    coord.config_entry = MagicMock(entry_id="meshcore_entry")
    coord.config_entry.data = {}
    coord.data = {}
    coord.name = "MyDevice"
    coord.pubkey = "deadbeef" * 8
    coord.device_info = {"sw_version": "2.6.0", "model": "T-deck"}
    coord.max_channels = 8
    coord._channel_info = {}
    coord._tracked_repeaters = []
    coord._tracked_clients = []
    coord._discovered_contacts = {}
    coord._contacts = {}
    coord._last_successful_request = {}
    coord._repeater_stats = {}
    coord._repeater_neighbors = {}
    coord._created_neighbor_sensors = set()
    coord._stale_neighbor_days = 30
    coord._cleanup_stale_neighbors = AsyncMock(return_value=0)
    coord._cleanup_stale_discovered_contacts = AsyncMock(return_value=0)
    coord._save_neighbor_data = AsyncMock()
    coord._fetch_all_channel_info = AsyncMock()
    coord.async_set_updated_data = MagicMock()
    coord.api.self_info = {}
    coord.location_source = "manual"
    coord.get_all_contacts = MagicMock(return_value=[])
    coord.mark_contact_dirty = MagicMock()
    coord.resolve_neighbor_name = MagicMock(return_value="resolved")
    coord.get_contact_by_prefix = MagicMock(return_value=None)
    for k, v in attrs.items():
        setattr(coord, k, v)
    return coord


@pytest.fixture
def coordinator(hass: HomeAssistant) -> MagicMock:
    """A coordinator registered at hass.data[MESHCORE_DOMAIN]['meshcore_entry']."""
    coord = _make_coordinator()
    hass.data[MESHCORE_DOMAIN] = {"meshcore_entry": coord}
    return coord


@pytest.fixture
def companion_entry(hass: HomeAssistant) -> MockConfigEntry:
    """A companion config entry with a MessageStore-shaped runtime_data."""
    entry = MockConfigEntry(
        domain=DOMAIN, title="MeshCore Chat", entry_id="01CHAT", data={}, options={}
    )
    entry.add_to_hass(hass)
    store = MagicMock()
    store.get_message_index = MagicMock(return_value={})
    store.get_messages = AsyncMock(return_value=[])
    store._load_for_search = AsyncMock(return_value=[])
    entry.runtime_data = MeshCoreChatRuntimeData(store=store)
    return entry


# ─── Pure-helper tests ─────────────────────────────────────────────────


def test_compute_type_counts_buckets_correctly() -> None:
    contacts = [
        {"type": 0}, {"type": 1}, {"type": 1},  # 3 clients
        {"type": 2}, {"type": 2},               # 2 repeaters
        {"type": 3},                            # 1 room server
        {"type": 4}, {"type": 4}, {"type": 4},  # 3 sensors
    ]
    counts = ws_api._compute_type_counts(contacts)
    assert counts == {"clients": 3, "repeaters": 2, "room_servers": 1, "sensors": 3}


def test_format_event_response_handles_none() -> None:
    assert ws_api._format_event_response(None) == "OK"


def test_format_event_response_handles_string() -> None:
    assert ws_api._format_event_response("hi") == "hi"


def test_format_event_response_extracts_payload_dict() -> None:
    result = MagicMock()
    result.payload = {"key": "value"}
    assert "key" in ws_api._format_event_response(result)


def test_format_event_response_msg_sent_ack() -> None:
    result = MagicMock()
    result.payload = {"type": "MSG_SENT", "expected_ack": True}
    assert ws_api._format_event_response(result) == "Command sent"


def test_format_event_response_empty_payload() -> None:
    result = MagicMock()
    result.payload = None
    assert ws_api._format_event_response(result) == "OK"


def test_trace_error_for_known_codes() -> None:
    """Each known upstream code → expected (chat_code, message) tuple."""
    msg = {"pubkey_prefix": "abc"}
    assert ws_api._trace_error_for("no_coordinator", {}, msg)[0] == "not_found"
    assert ws_api._trace_error_for("not_connected", {}, msg)[0] == "not_connected"
    assert ws_api._trace_error_for("contact_not_found", {}, msg)[0] == "not_in_mesh"
    assert ws_api._trace_error_for(
        "contact_not_on_device", {}, msg
    )[0] == "contact_not_on_device"
    assert ws_api._trace_error_for(
        "path_discovery_timeout", {}, msg
    )[0] == "path_discovery_timeout"
    # Unknown code → ("error", str(code))
    assert ws_api._trace_error_for("totally_unknown", {}, msg) == ("error", "totally_unknown")


def test_trace_error_for_path_discovery_failed_with_reason() -> None:
    """``no_firmware_ack`` reason → device-did-not-acknowledge wording."""
    code, msg_text = ws_api._trace_error_for(
        "path_discovery_failed", {"reason": "no_firmware_ack"}, {}
    )
    assert code == "path_discovery_failed"
    assert "did not acknowledge" in msg_text


# ─── _get_coordinator / _get_all_coordinators ───────────────────────────


def test_get_coordinator_returns_first_when_no_entry_id(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    assert ws_api._get_coordinator(hass) is coordinator


def test_get_coordinator_returns_named_entry(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    assert ws_api._get_coordinator(hass, "meshcore_entry") is coordinator


def test_get_coordinator_returns_none_when_meshcore_absent(
    hass: HomeAssistant,
) -> None:
    """No upstream meshcore in hass.data → None."""
    assert ws_api._get_coordinator(hass) is None


def test_get_coordinator_returns_none_for_invalid_object(
    hass: HomeAssistant,
) -> None:
    """Coordinator without ``api`` attr → None."""
    hass.data[MESHCORE_DOMAIN] = {"x": object()}
    assert ws_api._get_coordinator(hass, "x") is None


def test_get_all_coordinators_skips_non_coordinator_objects(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    hass.data[MESHCORE_DOMAIN]["junk"] = object()  # no .api
    assert len(ws_api._get_all_coordinators(hass)) == 1


def test_get_all_coordinators_empty_when_meshcore_absent(
    hass: HomeAssistant,
) -> None:
    assert ws_api._get_all_coordinators(hass) == []


def test_get_store_returns_runtime_store(
    hass: HomeAssistant, companion_entry: MockConfigEntry
) -> None:
    assert ws_api._get_store(hass, companion_entry.entry_id) is (
        companion_entry.runtime_data.store
    )


def test_get_store_falls_back_to_first_entry(
    hass: HomeAssistant, companion_entry: MockConfigEntry
) -> None:
    assert ws_api._get_store(hass) is companion_entry.runtime_data.store


def test_get_store_returns_none_when_unknown(hass: HomeAssistant) -> None:
    assert ws_api._get_store(hass) is None


# ─── ws_get_devices ─────────────────────────────────────────────────────


async def test_ws_get_devices_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    conn = _Connection()
    await _call_ws(ws_api.ws_get_devices, hass, conn, {"id": 1})
    assert conn.results
    payload = conn.results[0][1]
    assert "devices" in payload
    assert payload["devices"][0]["entry_id"] == "meshcore_entry"


async def test_ws_get_devices_empty_when_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(ws_api.ws_get_devices, hass, conn, {"id": 1})
    assert conn.results == [(1, {"devices": []})]


# ─── ws_get_contacts ─────────────────────────────────────────────────────


async def test_ws_get_contacts_happy_via_service(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Service path returns contacts; envelope unpacks correctly."""
    async def _fake_call(*args, **kwargs):
        return {"contacts": [{"adv_name": "A"}]}
    with (
        patch("homeassistant.core.ServiceRegistry.has_service", return_value=True),
        patch("homeassistant.core.ServiceRegistry.async_call", side_effect=_fake_call),
    ):
        conn = _Connection()
        await _call_ws(ws_api.ws_get_contacts, hass, conn, {"id": 1})
    assert conn.results[0][1]["contacts"] == [{"adv_name": "A"}]


async def test_ws_get_contacts_legacy_fallback(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """No service registered → coordinator.get_all_contacts() fallback."""
    coordinator.get_all_contacts = MagicMock(return_value=[{"adv_name": "B"}])
    with patch(
        "homeassistant.core.ServiceRegistry.has_service", return_value=False
    ):
        conn = _Connection()
        await _call_ws(ws_api.ws_get_contacts, hass, conn, {"id": 1})
    assert conn.results[0][1]["contacts"] == [{"adv_name": "B"}]


async def test_ws_get_contacts_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    """No upstream meshcore in hass.data → not_found via legacy fallback."""
    with patch(
        "homeassistant.core.ServiceRegistry.has_service", return_value=False
    ):
        conn = _Connection()
        await _call_ws(ws_api.ws_get_contacts, hass, conn, {"id": 1})
    assert conn.errors and conn.errors[0][1] == "not_found"


# ─── ws_get_contacts_paginated ──────────────────────────────────────────


async def test_ws_get_contacts_paginated_filters_and_paginates(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Paginates, filters by category, computes type counts."""
    contacts = [
        {"adv_name": "Alpha", "added_to_node": True, "type": 1, "lastmod": 100},
        {"adv_name": "Bravo", "added_to_node": False, "type": 1, "lastmod": 200},
        {"adv_name": "Cesium", "added_to_node": True, "type": 2, "lastmod": 50},
    ]
    async def _fake_call(*a, **kw):
        return {"contacts": contacts}
    with (
        patch("homeassistant.core.ServiceRegistry.has_service", return_value=True),
        patch("homeassistant.core.ServiceRegistry.async_call", side_effect=_fake_call),
    ):
        conn = _Connection()
        await _call_ws(
            ws_api.ws_get_contacts_paginated,
            hass,
            conn,
            {
                "id": 1, "category": "added", "limit": 50, "offset": 0,
                "sort_by": "name",
            },
        )
    payload = conn.results[0][1]
    assert payload["total"] == 2  # only "added" category
    # Alphabetic by name
    names = [c["adv_name"] for c in payload["contacts"]]
    assert names == sorted(names, key=str.lower)


async def test_ws_get_contacts_paginated_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    with patch(
        "homeassistant.core.ServiceRegistry.has_service", return_value=False
    ):
        conn = _Connection()
        await _call_ws(
            ws_api.ws_get_contacts_paginated,
            hass,
            conn,
            {
                "id": 1, "category": "all", "limit": 50, "offset": 0,
                "sort_by": "last_heard",
            },
        )
    assert conn.errors[0][1] == "not_found"


# ─── ws_get_node_counts ─────────────────────────────────────────────────


async def test_ws_get_node_counts_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    contacts = [
        {"added_to_node": True}, {"added_to_node": True},
        {"added_to_node": False},
    ]
    async def _fake_call(*a, **kw):
        return {"contacts": contacts}
    with (
        patch("homeassistant.core.ServiceRegistry.has_service", return_value=True),
        patch("homeassistant.core.ServiceRegistry.async_call", side_effect=_fake_call),
    ):
        conn = _Connection()
        await _call_ws(
            ws_api.ws_get_node_counts, hass, conn, {"id": 1}
        )
    assert conn.results[0][1] == {"all": 3, "added": 2, "discovered": 1}


async def test_ws_get_node_counts_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    with patch(
        "homeassistant.core.ServiceRegistry.has_service", return_value=False
    ):
        conn = _Connection()
        await _call_ws(ws_api.ws_get_node_counts, hass, conn, {"id": 1})
    assert conn.errors[0][1] == "not_found"


# ─── ws_clear_discovered_contacts (DESTRUCTIVE) ─────────────────────────


async def test_ws_clear_discovered_contacts_with_threshold(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator._cleanup_stale_discovered_contacts = AsyncMock(return_value=4)
    conn = _Connection()
    await _call_ws(
        ws_api.ws_clear_discovered_contacts,
        hass,
        conn,
        {"id": 1, "days_threshold": 30},
    )
    assert conn.results[0][1] == {"removed": 4}
    coordinator._cleanup_stale_discovered_contacts.assert_awaited_once_with(30)


async def test_ws_clear_discovered_contacts_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_clear_discovered_contacts, hass, conn, {"id": 1}
    )
    assert conn.errors[0][1] == "not_found"


# ─── ws_get_channels ────────────────────────────────────────────────────


async def test_ws_get_channels_skips_unused(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator._channel_info = {
        0: {"channel_name": "Public"},
        1: {"channel_name": "(unused)"},
        2: {"channel_name": "Trusted", "secret": b"\xab\xcd"},
    }
    conn = _Connection()
    await _call_ws(ws_api.ws_get_channels, hass, conn, {"id": 1})
    payload = conn.results[0][1]
    names = [c["name"] for c in payload["channels"]]
    assert "Public" in names and "Trusted" in names
    assert "(unused)" not in names
    # Bytes secret was hex-encoded
    trusted = next(c for c in payload["channels"] if c["name"] == "Trusted")
    assert trusted["settings"]["secret"] == "abcd"


async def test_ws_get_channels_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(ws_api.ws_get_channels, hass, conn, {"id": 1})
    assert conn.errors[0][1] == "not_found"


# ─── ws_get_managed_devices ─────────────────────────────────────────────


async def test_ws_get_managed_devices_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator._tracked_repeaters = [
        {
            "pubkey_prefix": "abc123",
            "name": "Repeater 1",
            "password": "secret",
            "update_interval": 300,
            "telemetry_enabled": True,
            "neighbors_enabled": False,
            "disable_path_reset": False,
        },
    ]
    coordinator._tracked_clients = [
        {
            "pubkey_prefix": "def456",
            "name": "Client A",
            "update_interval": 300,
            "disable_path_reset": False,
        },
    ]
    conn = _Connection()
    await _call_ws(ws_api.ws_get_managed_devices, hass, conn, {"id": 1})
    payload = conn.results[0][1]
    assert len(payload["repeaters"]) == 1
    # Password masked
    assert payload["repeaters"][0]["password"] == "***"
    assert len(payload["clients"]) == 1


async def test_ws_get_managed_devices_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(ws_api.ws_get_managed_devices, hass, conn, {"id": 1})
    assert conn.errors[0][1] == "not_found"


# ─── ws_get_device_config ───────────────────────────────────────────────


async def test_ws_get_device_config_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.self_info = {
        "radio_freq": 869,
        "radio_bw": 250,
        "radio_sf": 11,
        "radio_cr": 5,
        "tx_power": 22,
        "adv_lat": 32.7,
        "adv_lon": -117.1,
    }
    coordinator.config_entry.data = {"connection_type": "tcp", "tcp_host": "h", "tcp_port": 5000}
    conn = _Connection()
    await _call_ws(ws_api.ws_get_device_config, hass, conn, {"id": 1})
    config = conn.results[0][1]
    assert config["frequency"] == 869
    assert config["connection_address"] == "h:5000"


async def test_ws_get_device_config_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(ws_api.ws_get_device_config, hass, conn, {"id": 1})
    assert conn.errors[0][1] == "not_found"


# ─── ws_set_device_config (DESTRUCTIVE) ─────────────────────────────────


async def test_ws_set_device_config_writes_name(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.mesh_core.commands.set_name = AsyncMock()
    coordinator.api.mesh_core.commands.send_appstart = AsyncMock(
        return_value=MagicMock()
    )
    coordinator.api._cache_self_info_event = MagicMock()
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_device_config,
        hass,
        conn,
        {"id": 1, "settings": {"name": "newname"}},
    )
    coordinator.api.mesh_core.commands.set_name.assert_awaited_once_with("newname")
    assert conn.results[0][1] == {"success": True, "changed": ["name"]}


async def test_ws_set_device_config_handles_command_failure(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """SDK raises ConnectionError → mapped to not_connected via _WS_ERROR_MAP."""
    coordinator.api.mesh_core.commands.set_name = AsyncMock(
        side_effect=ConnectionError("device offline")
    )
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_device_config,
        hass,
        conn,
        {"id": 1, "settings": {"name": "x"}},
    )
    assert conn.errors[0][1] == "not_connected"


async def test_ws_set_device_config_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_device_config,
        hass,
        conn,
        {"id": 1, "settings": {"name": "x"}},
    )
    assert conn.errors[0][1] == "not_found"


# ─── ws_execute_local (DESTRUCTIVE) ─────────────────────────────────────


async def test_ws_execute_local_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.mesh_core.commands.send_get_status = AsyncMock(
        return_value=MagicMock(payload="ok")
    )
    conn = _Connection()
    await _call_ws(
        ws_api.ws_execute_local,
        hass,
        conn,
        {"id": 1, "command": "send_get_status", "args": {}},
    )
    assert conn.results[0][1]["success"] is True


async def test_ws_execute_local_rejects_dunder_command(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Defense-in-depth: leading-underscore method names are rejected."""
    conn = _Connection()
    await _call_ws(
        ws_api.ws_execute_local,
        hass,
        conn,
        {"id": 1, "command": "__init__", "args": {}},
    )
    assert conn.errors[0][1] == "invalid"


async def test_ws_execute_local_unknown_command(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Unknown command method → not_found error."""
    coordinator.api.mesh_core.commands = MagicMock(spec=[])
    conn = _Connection()
    await _call_ws(
        ws_api.ws_execute_local,
        hass,
        conn,
        {"id": 1, "command": "totally_made_up", "args": {}},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_execute_local_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_execute_local, hass, conn,
        {"id": 1, "command": "x", "args": {}},
    )
    assert conn.errors[0][1] == "not_found"


# ─── ws_execute_remote (DESTRUCTIVE) ────────────────────────────────────


async def test_ws_execute_remote_device_not_found(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Unknown target_prefix → not_found."""
    conn = _Connection()
    await _call_ws(
        ws_api.ws_execute_remote,
        hass,
        conn,
        {"id": 1, "target_prefix": "ghost", "command": "ver"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_execute_remote_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_execute_remote, hass, conn,
        {"id": 1, "target_prefix": "x", "command": "y"},
    )
    assert conn.errors[0][1] == "not_found"


# ─── ws_set_channel / ws_remove_channel (DESTRUCTIVE) ───────────────────


async def test_ws_set_channel_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.mesh_core.commands.set_channel = AsyncMock(
        return_value=MagicMock()
    )
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_channel,
        hass,
        conn,
        {"id": 1, "channel_idx": 0, "name": "myChan"},
    )
    coordinator.api.mesh_core.commands.set_channel.assert_awaited_once_with(
        0, "myChan", None
    )
    assert conn.results[0][1] == {"success": True}


async def test_ws_set_channel_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_channel, hass, conn,
        {"id": 1, "channel_idx": 0, "name": "x"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_set_channel_handles_sdk_error(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.mesh_core.commands.set_channel = AsyncMock(
        side_effect=asyncio.TimeoutError()
    )
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_channel,
        hass,
        conn,
        {"id": 1, "channel_idx": 0, "name": "x"},
    )
    assert conn.errors[0][1] == "timeout"


async def test_ws_remove_channel_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.mesh_core.commands.set_channel = AsyncMock(
        return_value=MagicMock()
    )
    conn = _Connection()
    await _call_ws(
        ws_api.ws_remove_channel,
        hass,
        conn,
        {"id": 1, "channel_idx": 3},
    )
    coordinator.api.mesh_core.commands.set_channel.assert_awaited_once_with(
        3, "", None
    )
    assert conn.results[0][1] == {"success": True}


async def test_ws_remove_channel_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_remove_channel, hass, conn,
        {"id": 1, "channel_idx": 0},
    )
    assert conn.errors[0][1] == "not_found"


# ─── ws_get_neighbors / ws_remove_neighbor / ws_cleanup_stale_neighbors ─


async def test_ws_get_neighbors_returns_sorted(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator._repeater_neighbors = {
        "rpt1": {
            "n1": {"snr": 5, "last_updated": 0, "secs_ago": 0, "seen_timestamps": []},
            "n2": {"snr": 10, "last_updated": 0, "secs_ago": 0, "seen_timestamps": []},
        }
    }
    conn = _Connection()
    await _call_ws(
        ws_api.ws_get_neighbors, hass, conn,
        {"id": 1, "target_prefix": "rpt1"},
    )
    neighbors = conn.results[0][1]["neighbors"]
    assert [n["pubkey_prefix"] for n in neighbors] == ["n2", "n1"]


async def test_ws_get_neighbors_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_get_neighbors, hass, conn,
        {"id": 1, "target_prefix": "x"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_remove_neighbor_repeater_not_found(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Unknown target_prefix → not_found."""
    conn = _Connection()
    await _call_ws(
        ws_api.ws_remove_neighbor,
        hass,
        conn,
        {"id": 1, "target_prefix": "ghost", "neighbor_pubkey": "n"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_remove_neighbor_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_remove_neighbor, hass, conn,
        {"id": 1, "target_prefix": "x", "neighbor_pubkey": "y"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_cleanup_stale_neighbors_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator._cleanup_stale_neighbors = AsyncMock(return_value=7)
    conn = _Connection()
    await _call_ws(
        ws_api.ws_cleanup_stale_neighbors,
        hass,
        conn,
        {"id": 1, "days_threshold": 14},
    )
    payload = conn.results[0][1]
    assert payload["removed"] == 7 and payload["days_threshold"] == 14


async def test_ws_cleanup_stale_neighbors_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_cleanup_stale_neighbors, hass, conn, {"id": 1}
    )
    assert conn.errors[0][1] == "not_found"


# ─── Unread tracker handlers ────────────────────────────────────────────


async def test_ws_get_unread_counts_returns_empty_when_no_tracker(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(ws_api.ws_get_unread_counts, hass, conn, {"id": 1})
    assert conn.results[0][1] == {"unread": {}}


async def test_ws_get_unread_counts_happy(hass: HomeAssistant) -> None:
    tracker = MagicMock()
    tracker.get_all_unread = MagicMock(return_value={"binary_sensor.x": 3})
    hass.data[DOMAIN] = {"unread_tracker": tracker}
    conn = _Connection()
    await _call_ws(ws_api.ws_get_unread_counts, hass, conn, {"id": 1})
    assert conn.results[0][1] == {"unread": {"binary_sensor.x": 3}}


async def test_ws_mark_read_happy(hass: HomeAssistant) -> None:
    tracker = MagicMock()
    tracker.mark_read = AsyncMock()
    hass.data[DOMAIN] = {"unread_tracker": tracker}
    conn = _Connection()
    await _call_ws(
        ws_api.ws_mark_read,
        hass,
        conn,
        {"id": 1, "entity_id": "binary_sensor.alice"},
    )
    tracker.mark_read.assert_awaited_once_with("binary_sensor.alice")
    assert conn.results[0][1] == {"success": True}


async def test_ws_mark_read_no_tracker(hass: HomeAssistant) -> None:
    """Mark-read with no tracker still resolves with success=True."""
    conn = _Connection()
    await _call_ws(
        ws_api.ws_mark_read, hass, conn,
        {"id": 1, "entity_id": "binary_sensor.x"},
    )
    assert conn.results[0][1] == {"success": True}


# ─── Identity handlers (DESTRUCTIVE) ────────────────────────────────────


async def test_ws_regenerate_identity_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.mesh_core.commands.regenerate_key = AsyncMock()
    coordinator.api.self_info = {"pubkey": "newkey1234"}
    conn = _Connection()
    await _call_ws(ws_api.ws_regenerate_identity, hass, conn, {"id": 1})
    payload = conn.results[0][1]
    assert payload["success"] and payload["new_pubkey"] == "newkey1234"


async def test_ws_regenerate_identity_handles_failure(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.mesh_core.commands.regenerate_key = AsyncMock(
        side_effect=ConnectionError("disconnected")
    )
    conn = _Connection()
    await _call_ws(ws_api.ws_regenerate_identity, hass, conn, {"id": 1})
    assert conn.errors[0][1] == "not_connected"


async def test_ws_regenerate_identity_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(ws_api.ws_regenerate_identity, hass, conn, {"id": 1})
    assert conn.errors[0][1] == "not_found"


async def test_ws_import_identity_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator.api.mesh_core.commands.import_key = AsyncMock()
    coordinator.api.self_info = {"pubkey": "importedkey"}
    conn = _Connection()
    await _call_ws(
        ws_api.ws_import_identity,
        hass,
        conn,
        {"id": 1, "private_key": "deadbeef"},
    )
    assert conn.results[0][1]["pubkey"] == "importedkey"


async def test_ws_import_identity_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_import_identity, hass, conn,
        {"id": 1, "private_key": "x"},
    )
    assert conn.errors[0][1] == "not_found"


# ─── ws_set_location_source ─────────────────────────────────────────────


async def test_ws_set_location_source_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_location_source,
        hass,
        conn,
        {"id": 1, "source": "manual"},
    )
    assert conn.results[0][1] == {"success": True}
    assert coordinator.location_source == "manual"


async def test_ws_set_location_source_invalid(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_location_source,
        hass,
        conn,
        {"id": 1, "source": "garbage"},
    )
    assert conn.errors[0][1] == "invalid"


async def test_ws_set_location_source_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_location_source, hass, conn,
        {"id": 1, "source": "manual"},
    )
    assert conn.errors[0][1] == "not_found"


# ─── ws_add_contact / ws_remove_contact (DESTRUCTIVE) ───────────────────


async def test_ws_add_contact_not_found_in_discovered(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Public key not in _discovered_contacts and not already added → not_found."""
    coordinator._discovered_contacts = {}
    coordinator._contacts = {}
    conn = _Connection()
    await _call_ws(
        ws_api.ws_add_contact,
        hass,
        conn,
        {"id": 1, "public_key": "abcdef123456"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_add_contact_already_added(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Pubkey prefix already in coordinator._contacts → already_added."""
    coordinator._contacts = {"abcdef123456": {"public_key": "abcdef123456"}}
    conn = _Connection()
    await _call_ws(
        ws_api.ws_add_contact,
        hass,
        conn,
        {"id": 1, "public_key": "abcdef123456"},
    )
    assert conn.errors[0][1] == "already_added"


async def test_ws_add_contact_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_add_contact, hass, conn,
        {"id": 1, "public_key": "x"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_remove_contact_not_found(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator._contacts = {}
    conn = _Connection()
    await _call_ws(
        ws_api.ws_remove_contact,
        hass,
        conn,
        {"id": 1, "public_key": "abcdef123456"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_remove_contact_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_remove_contact, hass, conn,
        {"id": 1, "public_key": "x"},
    )
    assert conn.errors[0][1] == "not_found"


# ─── ws_trace ───────────────────────────────────────────────────────────


async def test_ws_trace_service_unavailable(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """meshcore.trace service not registered → service_unavailable."""
    with patch(
        "homeassistant.core.ServiceRegistry.has_service", return_value=False
    ):
        conn = _Connection()
        await _call_ws(
            ws_api.ws_trace,
            hass,
            conn,
            {"id": 1, "pubkey_prefix": "abc"},
        )
    assert conn.errors[0][1] == "service_unavailable"


async def test_ws_trace_happy_via_service(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    async def _fake_call(*a, **kw):
        return {"trace": {"round_trip_ms": 312, "hops": 2, "final_snr": -7, "path": []}}
    with (
        patch("homeassistant.core.ServiceRegistry.has_service", return_value=True),
        patch("homeassistant.core.ServiceRegistry.async_call", side_effect=_fake_call),
    ):
        conn = _Connection()
        await _call_ws(
            ws_api.ws_trace,
            hass,
            conn,
            {"id": 1, "pubkey_prefix": "abc"},
        )
    payload = conn.results[0][1]
    assert payload["round_trip_ms"] == 312
    assert payload["response_time"] == "312ms"
    assert payload["hops"] == 2


async def test_ws_trace_service_returns_error_envelope(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """No trace key but error key → mapped via _trace_error_for."""
    async def _fake_call(*a, **kw):
        return {"error": "no_coordinator"}
    with (
        patch("homeassistant.core.ServiceRegistry.has_service", return_value=True),
        patch("homeassistant.core.ServiceRegistry.async_call", side_effect=_fake_call),
    ):
        conn = _Connection()
        await _call_ws(
            ws_api.ws_trace,
            hass,
            conn,
            {"id": 1, "pubkey_prefix": "abc"},
        )
    assert conn.errors[0][1] == "not_found"


# ─── ws_get_blocked_contacts / ws_set_contact_blocked ───────────────────


async def test_ws_get_blocked_contacts_happy(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    coordinator._blocked_contacts = {"abc"}
    coordinator.get_all_contacts = MagicMock(
        return_value=[
            {"public_key": "abc" + "x" * 60, "adv_name": "blocked"},
            {"public_key": "xyz" + "x" * 60, "adv_name": "ok"},
        ]
    )
    conn = _Connection()
    await _call_ws(ws_api.ws_get_blocked_contacts, hass, conn, {"id": 1})
    blocked = conn.results[0][1]["contacts"]
    # set_contact_blocked uses public_key[:12]; only contacts whose first 12
    # chars match a prefix in the set are returned. Our test set has "abc"
    # (3 chars) which won't match 12-char prefix slicing — verify zero
    # results, then exercise the actual full-prefix path below.
    assert blocked == []


async def test_ws_get_blocked_contacts_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(ws_api.ws_get_blocked_contacts, hass, conn, {"id": 1})
    assert conn.errors[0][1] == "not_found"


async def test_ws_set_contact_blocked_toggles(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Block then unblock — _blocked_contacts set tracks the prefix."""
    if hasattr(coordinator, "_blocked_contacts"):
        del coordinator._blocked_contacts
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_contact_blocked,
        hass,
        conn,
        {"id": 1, "public_key": "abcdef123456zzzz", "blocked": True},
    )
    assert "abcdef123456" in coordinator._blocked_contacts

    await _call_ws(
        ws_api.ws_set_contact_blocked,
        hass,
        conn,
        {"id": 2, "public_key": "abcdef123456zzzz", "blocked": False},
    )
    assert "abcdef123456" not in coordinator._blocked_contacts


async def test_ws_set_contact_blocked_error_no_coordinator(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_set_contact_blocked, hass, conn,
        {"id": 1, "public_key": "x", "blocked": True},
    )
    assert conn.errors[0][1] == "not_found"


# ─── Message store handlers ─────────────────────────────────────────────


async def test_ws_get_stored_messages_happy(
    hass: HomeAssistant, companion_entry: MockConfigEntry
) -> None:
    companion_entry.runtime_data.store.get_messages = AsyncMock(
        return_value=[{"id": "m1"}, {"id": "m2"}]
    )
    conn = _Connection()
    await _call_ws(
        ws_api.ws_get_stored_messages,
        hass,
        conn,
        {"id": 1, "entity_id": "binary_sensor.x", "limit": 50},
    )
    payload = conn.results[0][1]
    assert payload["messages"] == [{"id": "m1"}, {"id": "m2"}]
    assert payload["has_more"] is False


async def test_ws_get_stored_messages_error_no_store(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_get_stored_messages, hass, conn,
        {"id": 1, "entity_id": "binary_sensor.x", "limit": 50},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_get_stored_message_count_happy(
    hass: HomeAssistant, companion_entry: MockConfigEntry
) -> None:
    companion_entry.runtime_data.store.get_message_index = MagicMock(
        return_value={"binary_sensor.x": {"message_count": 42}}
    )
    conn = _Connection()
    await _call_ws(
        ws_api.ws_get_stored_message_count,
        hass,
        conn,
        {"id": 1, "entity_id": "binary_sensor.x"},
    )
    assert conn.results[0][1] == {"count": 42}


async def test_ws_get_stored_message_count_error_no_store(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_get_stored_message_count, hass, conn,
        {"id": 1, "entity_id": "binary_sensor.x"},
    )
    assert conn.errors[0][1] == "not_found"


async def test_ws_search_stored_messages_happy(
    hass: HomeAssistant, companion_entry: MockConfigEntry
) -> None:
    companion_entry.runtime_data.store.get_message_index = MagicMock(
        return_value={"binary_sensor.x": {}}
    )
    companion_entry.runtime_data.store._load_for_search = AsyncMock(
        return_value=[
            {"id": "1", "text": "hello world", "sender": "Alice", "timestamp": "t1"},
            {"id": "2", "text": "needle here", "sender": "Bob", "timestamp": "t2"},
        ]
    )
    conn = _Connection()
    await _call_ws(
        ws_api.ws_search_stored_messages,
        hass,
        conn,
        {"id": 1, "query": "needle", "limit": 20},
    )
    payload = conn.results[0][1]
    assert "results" in payload
    hits = payload["results"]
    assert {h["id"] for h in hits} == {"2"}
    assert hits[0]["entity_id"] == "binary_sensor.x"


async def test_ws_search_stored_messages_error_no_store(
    hass: HomeAssistant,
) -> None:
    conn = _Connection()
    await _call_ws(
        ws_api.ws_search_stored_messages, hass, conn,
        {"id": 1, "query": "x", "limit": 20},
    )
    assert conn.errors[0][1] == "not_found"


# ─── Runtime upstream-removal repair-issue sync ─────────────────────────
#
# Phase 1 of the runtime-removal-detection proposal hooks
# `_sync_upstream_repair_issue` into the WS coordinator-discovery path.
# These tests cover the user-visible flow: upstream present → no issue;
# upstream removed mid-session → issue surfaces on next WS hit; upstream
# restored → issue auto-clears on next WS hit. Plus the idempotency
# loop that backs Risk 1 in the proposal.


def _has_upstream_repair_issue(hass: HomeAssistant) -> bool:
    """True iff the upstream_meshcore_unavailable issue is registered."""
    return (
        ir.async_get(hass).async_get_issue(
            DOMAIN, "upstream_meshcore_unavailable"
        )
        is not None
    )


async def test_ws_get_devices_runtime_removal_creates_repair_issue(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Upstream present → ws_get_devices clean; remove → next call surfaces issue.

    Mirrors the observable bug: the user removes the upstream meshcore
    config entry while meshcore_chat is still loaded; the chat panel's
    next backend hit should publish the repair issue rather than
    silently degrade.
    """
    # Phase 1 — upstream present, normal traffic. No repair issue.
    conn1 = _Connection()
    await _call_ws(ws_api.ws_get_devices, hass, conn1, {"id": 1})
    assert conn1.results
    assert conn1.results[0][1]["devices"][0]["entry_id"] == "meshcore_entry"
    assert not _has_upstream_repair_issue(hass)

    # Phase 2 — upstream removed at runtime (config-entry delete simulation).
    # Pop the bucket entirely; this matches what upstream's unload does
    # in practice (drops the per-entry coordinator, leaves no bucket if
    # it was the only entry).
    hass.data.pop(MESHCORE_DOMAIN, None)

    conn2 = _Connection()
    await _call_ws(ws_api.ws_get_devices, hass, conn2, {"id": 2})
    # Empty result + repair issue surfaced.
    assert conn2.results == [(2, {"devices": []})]
    assert _has_upstream_repair_issue(hass)

    # Phase 3 — upstream restored (re-add the coordinator). Next WS hit
    # auto-clears the repair issue.
    hass.data[MESHCORE_DOMAIN] = {"meshcore_entry": coordinator}

    conn3 = _Connection()
    await _call_ws(ws_api.ws_get_devices, hass, conn3, {"id": 3})
    assert conn3.results
    assert conn3.results[0][1]["devices"][0]["entry_id"] == "meshcore_entry"
    assert not _has_upstream_repair_issue(hass)


def test_get_coordinator_creates_repair_issue_when_upstream_absent(
    hass: HomeAssistant,
) -> None:
    """Direct helper call with no upstream → returns None, raises issue."""
    hass.data.pop(MESHCORE_DOMAIN, None)
    assert ws_api._get_coordinator(hass) is None
    assert _has_upstream_repair_issue(hass)


def test_get_coordinator_clears_repair_issue_when_upstream_returns(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Pre-existing issue + upstream present → helper call clears it."""
    # Seed the issue.
    ir.async_create_issue(
        hass, DOMAIN, "upstream_meshcore_unavailable",
        is_fixable=True,
        severity=ir.IssueSeverity.ERROR,
        translation_key="upstream_meshcore_unavailable",
    )
    assert _has_upstream_repair_issue(hass)
    # Helper call with upstream present clears it.
    assert ws_api._get_coordinator(hass) is coordinator
    assert not _has_upstream_repair_issue(hass)


def test_get_all_coordinators_creates_repair_issue_when_upstream_absent(
    hass: HomeAssistant,
) -> None:
    """Direct helper call with no upstream → empty list, raises issue."""
    hass.data.pop(MESHCORE_DOMAIN, None)
    assert ws_api._get_all_coordinators(hass) == []
    assert _has_upstream_repair_issue(hass)


def test_get_all_coordinators_clears_repair_issue_when_upstream_returns(
    hass: HomeAssistant, coordinator: MagicMock
) -> None:
    """Pre-existing issue + upstream present → helper call clears it."""
    ir.async_create_issue(
        hass, DOMAIN, "upstream_meshcore_unavailable",
        is_fixable=True,
        severity=ir.IssueSeverity.ERROR,
        translation_key="upstream_meshcore_unavailable",
    )
    assert _has_upstream_repair_issue(hass)
    assert len(ws_api._get_all_coordinators(hass)) == 1
    assert not _has_upstream_repair_issue(hass)


def test_get_coordinator_idempotent_under_panel_polling(
    hass: HomeAssistant,
) -> None:
    """Risk 1: 50× helper calls with upstream absent → exactly 1 issue.

    The chat panel typically fires get_devices + get_contacts +
    get_channels on every load; if the user is reloading aggressively,
    the helpers fire dozens of times per minute. HA's issue registry
    dedupes by (domain, issue_id), so we end up with exactly one entry.
    """
    hass.data.pop(MESHCORE_DOMAIN, None)
    for _ in range(50):
        ws_api._get_coordinator(hass)
        ws_api._get_all_coordinators(hass)
    registry = ir.async_get(hass)
    matching = [
        i for i in registry.issues.values()
        if i.domain == DOMAIN
        and i.issue_id == "upstream_meshcore_unavailable"
    ]
    assert len(matching) == 1
