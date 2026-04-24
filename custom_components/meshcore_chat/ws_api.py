"""MeshCore Chat WebSocket API.

Lifted from upstream feature/sidebar-panel ws_api.py for the companion
integration. All type strings are namespaced under meshcore_chat/* to
avoid collision with upstream meshcore/* commands. Coordinator state
lookups go via hass.data[MESHCORE_DOMAIN] because the chat panel acts
as a consumer of the upstream meshcore integration's coordinator.

See proposal Change 5 (extended scope per 2026-04-22 user direction).
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr

from .const import DOMAIN, MESHCORE_DOMAIN, ENTITY_DOMAIN_BINARY_SENSOR
from .message_store import MessageStore
from .utils import format_entity_id, sanitize_name

_LOGGER = logging.getLogger(__name__)


def _get_coordinator(hass: HomeAssistant, entry_id: str | None = None):
    """Get the upstream meshcore coordinator for ``entry_id``, or first available.

    The companion does not own a coordinator — it consumes the upstream
    integration's coordinator via ``hass.data[MESHCORE_DOMAIN][meshcore_entry_id]``.
    The ``entry_id`` argument here, when supplied by the frontend, is the
    *upstream* meshcore config-entry id (the chat panel discovers it via the
    ``meshcore_chat/get_devices`` command, which in turn reads upstream's
    coordinator registry). When omitted, the first registered upstream
    coordinator is used.
    """
    if MESHCORE_DOMAIN not in hass.data:
        return None

    if entry_id and entry_id in hass.data[MESHCORE_DOMAIN]:
        coord = hass.data[MESHCORE_DOMAIN][entry_id]
        if hasattr(coord, "api"):
            return coord
        return None

    # Return first coordinator found
    for key, value in hass.data[MESHCORE_DOMAIN].items():
        if hasattr(value, "api"):
            return value
    return None


def _get_all_coordinators(hass: HomeAssistant) -> list:
    """Get all active upstream coordinators."""
    if MESHCORE_DOMAIN not in hass.data:
        return []
    return [
        (entry_id, coord)
        for entry_id, coord in hass.data[MESHCORE_DOMAIN].items()
        if hasattr(coord, "api")
    ]


def _get_store(
    hass: HomeAssistant, entry_id: str | None = None
) -> MessageStore | None:
    """Return the companion's per-entry MessageStore.

    The companion's message store is owned by *this* integration, not the
    upstream meshcore one — so it lives in ``hass.data[DOMAIN][entry_id]``.
    Note ``entry_id`` here is the *companion's* config-entry id (typically
    a singleton per HA instance because the panel is installed once).
    Falls back to the first registered companion entry when ``entry_id``
    is omitted.
    """
    bucket = hass.data.get(DOMAIN)
    if not bucket:
        return None

    if entry_id and entry_id in bucket:
        store = bucket[entry_id].get("store") if isinstance(bucket[entry_id], dict) else None
        return store if isinstance(store, MessageStore) else None

    # Fallback: first available entry with a store.
    for value in bucket.values():
        store = value.get("store") if isinstance(value, dict) else None
        if isinstance(store, MessageStore):
            return store
    return None


def async_register_ws_commands(hass: HomeAssistant) -> None:
    """Register all MeshCore Chat WebSocket commands."""
    # Phase 1 commands
    websocket_api.async_register_command(hass, ws_get_devices)
    websocket_api.async_register_command(hass, ws_get_contacts)
    websocket_api.async_register_command(hass, ws_get_channels)

    # Phase 2 commands
    websocket_api.async_register_command(hass, ws_get_managed_devices)
    websocket_api.async_register_command(hass, ws_get_device_config)
    websocket_api.async_register_command(hass, ws_set_device_config)
    websocket_api.async_register_command(hass, ws_execute_local)
    websocket_api.async_register_command(hass, ws_execute_remote)
    websocket_api.async_register_command(hass, ws_set_channel)
    websocket_api.async_register_command(hass, ws_remove_channel)

    # Phase 3 commands
    websocket_api.async_register_command(hass, ws_get_neighbors)
    websocket_api.async_register_command(hass, ws_remove_neighbor)
    websocket_api.async_register_command(hass, ws_cleanup_stale_neighbors)

    # Phase 4 commands
    websocket_api.async_register_command(hass, ws_get_unread_counts)
    websocket_api.async_register_command(hass, ws_mark_read)
    websocket_api.async_register_command(hass, ws_regenerate_identity)
    websocket_api.async_register_command(hass, ws_import_identity)
    websocket_api.async_register_command(hass, ws_set_location_source)
    websocket_api.async_register_command(hass, ws_add_contact)
    websocket_api.async_register_command(hass, ws_remove_contact)
    websocket_api.async_register_command(hass, ws_trace)
    websocket_api.async_register_command(hass, ws_get_blocked_contacts)
    websocket_api.async_register_command(hass, ws_set_contact_blocked)

    # Paginated contacts & counts
    websocket_api.async_register_command(hass, ws_get_contacts_paginated)
    websocket_api.async_register_command(hass, ws_get_node_counts)
    websocket_api.async_register_command(hass, ws_clear_discovered_contacts)

    # Message store commands
    websocket_api.async_register_command(hass, ws_get_stored_messages)
    websocket_api.async_register_command(hass, ws_get_stored_message_count)
    websocket_api.async_register_command(hass, ws_search_stored_messages)

    _LOGGER.debug("Registered MeshCore Chat WebSocket API commands")


# ─── meshcore/get_devices ────────────────────────────────────────────
# Returns list of configured MeshCore companion devices (config entries)
# so the panel can populate the device switcher dropdown.


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_devices",
    }
)
@callback
def ws_get_devices(hass, connection, msg):
    """Return all configured MeshCore companion devices."""
    devices = []
    for entry_id, coordinator in _get_all_coordinators(hass):
        devices.append(
            {
                "entry_id": entry_id,
                "name": coordinator.name or "Unknown",
                "pubkey": coordinator.pubkey or "",
                "pubkey_prefix": (coordinator.pubkey or "")[:12],
                "firmware": coordinator.device_info.get("sw_version", ""),
                "connected": coordinator.api.connected,
            }
        )
    connection.send_result(msg["id"], {"devices": devices})


# ─── meshcore/get_contacts ───────────────────────────────────────────
# Returns all contacts (saved + discovered) with full attributes.


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_contacts",
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_get_contacts(hass, connection, msg):
    """Return all contacts for the specified (or first) config entry."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    contacts = coordinator.get_all_contacts()
    connection.send_result(msg["id"], {"contacts": contacts})


# ─── meshcore/get_contacts_paginated ─────────────────────────────────
# Returns paginated, filtered contacts with type counts.


def _compute_type_counts(contacts: list) -> dict:
    """Compute per-type counts for a list of contacts.

    Inlined from upstream feature/sidebar-panel coordinator
    (`_compute_type_counts` static method) — see Phase 4 deploy notes.
    The companion-supporting `dev/combined` coordinator deliberately omits
    `get_contacts_paginated` / `get_node_counts`, so the companion duplicates
    the small amount of logic that operates on the public `get_all_contacts()`
    payload. TODO(v0.2): refactor into a single `coordinator_facade` module.
    """
    counts = {"clients": 0, "repeaters": 0, "room_servers": 0, "sensors": 0}
    for c in contacts:
        t = c.get("type", 0)
        if t in (0, 1):
            counts["clients"] += 1
        elif t == 2:
            counts["repeaters"] += 1
        elif t == 3:
            counts["room_servers"] += 1
        elif t == 4:
            counts["sensors"] += 1
    return counts


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_contacts_paginated",
        vol.Optional("entry_id"): str,
        vol.Optional("category", default="all"): vol.In(
            ["all", "added", "discovered"]
        ),
        vol.Optional("node_type"): int,
        vol.Optional("search"): str,
        vol.Optional("limit", default=50): int,
        vol.Optional("offset", default=0): int,
        vol.Optional("sort_by", default="last_heard"): vol.In(
            ["last_heard", "name", "prefix"]
        ),
    }
)
@callback
def ws_get_contacts_paginated(hass, connection, msg):
    """Return paginated contacts with filtering and type counts.

    Inlined from upstream feature/sidebar-panel `coordinator.get_contacts_paginated`
    — companion-supporting `dev/combined` doesn't ship that helper. All filtering
    and sorting runs against `coordinator.get_all_contacts()`. See `_compute_type_counts`.
    TODO(v0.2): hoist into `coordinator_facade`.
    """
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    category = msg["category"]
    node_type = msg.get("node_type")
    search = msg.get("search")
    limit = msg["limit"]
    offset = msg["offset"]
    sort_by = msg["sort_by"]

    all_contacts = coordinator.get_all_contacts()

    # Category filter (added vs discovered)
    if category == "added":
        filtered = [c for c in all_contacts if c.get("added_to_node")]
    elif category == "discovered":
        filtered = [c for c in all_contacts if not c.get("added_to_node")]
    else:
        filtered = list(all_contacts)

    # Type counts BEFORE search filter (but after category filter), so the
    # category badges remain stable as the user types in the search box.
    type_counts = _compute_type_counts(filtered)

    # Search filter (substring match against adv_name and pubkey_prefix)
    if search:
        search_lower = search.lower()
        filtered = [
            c for c in filtered
            if search_lower in (c.get("adv_name") or "").lower()
            or search_lower in (c.get("pubkey_prefix") or "").lower()
        ]

    # Type filter — clients are 0 OR 1 (firmware-emitted ambiguity).
    if node_type is not None:
        if node_type <= 1:
            filtered = [c for c in filtered if c.get("type", 0) in (0, 1)]
        else:
            filtered = [c for c in filtered if c.get("type") == node_type]

    # Sort BEFORE pagination so the visible page reflects the true top-N.
    if sort_by == "name":
        # Strip leading whitespace before lowering — some firmware emits
        # adv_name with a leading space which would otherwise sort below all
        # printable chars.
        filtered.sort(key=lambda c: (c.get("adv_name") or "").strip().lower())
    elif sort_by == "prefix":
        filtered.sort(key=lambda c: c.get("pubkey_prefix") or "")
    else:
        # "last_heard" default — keyed on `lastmod` (not `last_advert`) so
        # firmware-emitted bogus year-2081+ values can't pin nodes to top.
        filtered.sort(key=lambda c: c.get("lastmod") or 0, reverse=True)

    total = len(filtered)
    page = filtered[offset : offset + limit]

    connection.send_result(
        msg["id"],
        {"contacts": page, "total": total, "counts": type_counts},
    )


# ─── meshcore/get_node_counts ────────────────────────────────────────
# Returns counts for each primary category (Level 1 filters).


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_node_counts",
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_get_node_counts(hass, connection, msg):
    """Return node counts for each primary filter category.

    Inlined from upstream feature/sidebar-panel `coordinator.get_node_counts` —
    companion-supporting `dev/combined` doesn't ship that helper. Counts are
    derived from `coordinator.get_all_contacts()`. TODO(v0.2): hoist into
    `coordinator_facade`.
    """
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    all_contacts = coordinator.get_all_contacts()
    added = sum(1 for c in all_contacts if c.get("added_to_node"))
    discovered = sum(1 for c in all_contacts if not c.get("added_to_node"))
    connection.send_result(
        msg["id"],
        {
            "all": added + discovered,
            "added": added,
            "discovered": discovered,
        },
    )


# ─── meshcore/clear_discovered_contacts ─────────────────────────────
# Clears discovered contacts. If days_threshold is provided, only
# contacts whose lastmod exceeds that age are removed; otherwise all
# discovered contacts are removed.


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/clear_discovered_contacts",
        vol.Optional("days_threshold"): vol.All(int, vol.Range(min=1, max=365)),
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_clear_discovered_contacts(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Clear discovered contacts, optionally only those older than N days."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No active MeshCore coordinator")
        return

    days_threshold = msg.get("days_threshold")
    if days_threshold is not None:
        removed = await coordinator._cleanup_stale_discovered_contacts(days_threshold)
    else:
        # Clear all discovered contacts
        from homeassistant.helpers import entity_registry as er
        entity_registry = er.async_get(hass)
        removed = len(coordinator._discovered_contacts)

        for public_key in list(coordinator._discovered_contacts.keys()):
            pubkey_prefix = public_key[:12]
            coordinator.tracked_diagnostic_binary_contacts.discard(pubkey_prefix)
            entity_id = entity_registry.async_get_entity_id(
                "binary_sensor", MESHCORE_DOMAIN, pubkey_prefix
            )
            if entity_id:
                entity_registry.async_remove(entity_id)

        coordinator._discovered_contacts.clear()

        try:
            await coordinator._store.async_save(coordinator._discovered_contacts)
        except Exception as ex:
            _LOGGER.error("Error saving discovered contacts: %s", ex)

        updated_data = dict(coordinator.data) if coordinator.data else {}
        updated_data["contacts"] = coordinator.get_all_contacts()
        coordinator.async_set_updated_data(updated_data)

    connection.send_result(msg["id"], {"removed": removed})


# ─── meshcore/get_channels ──────────────────────────────────────────
# Returns channel list with names and settings.


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_channels",
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_get_channels(hass, connection, msg):
    """Return channel information for the specified (or first) config entry."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    channels = []
    for idx in range(coordinator.max_channels):
        info = coordinator._channel_info.get(idx, {})
        channel_name = info.get("channel_name", "")
        # Skip unused/unconfigured channel slots
        if not channel_name or channel_name == "(unused)":
            continue
        # Sanitize settings: convert bytes to hex strings for JSON serialization
        sanitized = {}
        for k, v in info.items():
            if isinstance(v, bytes):
                sanitized[k] = v.hex()
            elif isinstance(v, dict):
                sanitized[k] = {
                    sk: sv.hex() if isinstance(sv, bytes) else sv
                    for sk, sv in v.items()
                }
            else:
                sanitized[k] = v
        channels.append(
            {
                "channel_idx": idx,
                "name": channel_name,
                "settings": sanitized,
            }
        )
    connection.send_result(msg["id"], {"channels": channels})


# ─── PHASE 2: meshcore/get_managed_devices ──────────────────────────────
# Returns tracked repeaters and clients with entity IDs


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_managed_devices",
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_get_managed_devices(hass, connection, msg):
    """Return managed repeaters and clients."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    repeaters = []
    clients = []
    dev_reg = dr.async_get(hass)
    entry_id = coordinator.config_entry.entry_id
    now = time.time()

    def _device_status(pubkey_prefix: str, update_interval: int) -> str:
        """Derive per-device online status from poll history.

        Returns 'online' if the last successful request was within
        2.5x the update interval, 'offline' if it was longer ago,
        or 'unknown' if no request has been made yet.  Also requires
        the companion BLE/serial link to be up.
        """
        if not coordinator.api.connected:
            return "offline"
        last_success = coordinator._last_successful_request.get(pubkey_prefix)
        if last_success is None:
            return "unknown"
        staleness_window = max(update_interval, 300) * 2.5
        return "online" if (now - last_success) < staleness_window else "offline"

    # Process tracked repeaters
    for repeater_config in coordinator._tracked_repeaters:
        pubkey_prefix = repeater_config.get("pubkey_prefix", "")
        repeater_name = repeater_config.get("name", "")
        stats = coordinator._repeater_stats.get(pubkey_prefix, {})
        update_interval = repeater_config.get("update_interval", 0)

        # Look up firmware version from HA device registry
        fw_version = stats.get("firmware_version")
        if not fw_version:
            device = dev_reg.async_get_device(
                identifiers={(MESHCORE_DOMAIN, f"{entry_id}_repeater_{pubkey_prefix}")}
            )
            if device:
                fw_version = device.sw_version

        repeaters.append(
            {
                "name": repeater_name,
                "pubkey_prefix": pubkey_prefix,
                "password": "***" if repeater_config.get("password") else "",
                "update_interval": update_interval,
                "telemetry_enabled": repeater_config.get("telemetry_enabled", False),
                "neighbors_enabled": repeater_config.get("neighbors_enabled", False),
                "disable_path_reset": repeater_config.get("disable_path_reset", False),
                "connected": coordinator.api.connected,
                "status": _device_status(pubkey_prefix, update_interval),
                "status_entity_id": format_entity_id(
                    ENTITY_DOMAIN_BINARY_SENSOR,
                    pubkey_prefix[:10],
                    "online",
                    sanitize_name(repeater_name),
                ),
                "firmware_version": fw_version,
                "stats": stats,
            }
        )

    # Process tracked clients
    for client_config in coordinator._tracked_clients:
        pubkey_prefix = client_config.get("pubkey_prefix", "")
        client_name = client_config.get("name", "")
        update_interval = client_config.get("update_interval", 0)

        clients.append(
            {
                "name": client_name,
                "pubkey_prefix": pubkey_prefix,
                "update_interval": update_interval,
                "disable_path_reset": client_config.get("disable_path_reset", False),
                "connected": coordinator.api.connected,
                "status": _device_status(pubkey_prefix, update_interval),
                "status_entity_id": format_entity_id(
                    ENTITY_DOMAIN_BINARY_SENSOR,
                    pubkey_prefix[:10],
                    "online",
                    sanitize_name(client_name),
                ),
            }
        )

    connection.send_result(
        msg["id"], {"repeaters": repeaters, "clients": clients}
    )


# ─── PHASE 2: meshcore/get_device_config ────────────────────────────────
# Read companion device settings


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_device_config",
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_get_device_config(hass, connection, msg):
    """Return companion device config."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    # Gather device config from coordinator
    config = {
        "name": coordinator.name or "",
        "pubkey": coordinator.pubkey or "",
        "firmware_version": coordinator.device_info.get("sw_version", ""),
        "hardware_model": coordinator.device_info.get("model", ""),
        "max_channels": coordinator.max_channels,
    }

    # Radio settings from self_info cache
    self_info = getattr(coordinator.api, 'self_info', {}) or {}
    config["frequency"] = self_info.get("radio_freq")
    config["bandwidth"] = self_info.get("radio_bw")
    config["spreading_factor"] = self_info.get("radio_sf")
    config["coding_rate"] = self_info.get("radio_cr")
    config["tx_power"] = self_info.get("tx_power")

    # Location from self_info
    config["latitude"] = self_info.get("adv_lat")
    config["longitude"] = self_info.get("adv_lon")
    config["altitude"] = None  # Not available in SDK - set_coords() hardcodes altitude to 0

    # Advanced settings
    config["path_hash_mode"] = self_info.get("path_hash_mode")

    # Location source
    config["location_source"] = getattr(coordinator, "location_source", "manual")

    # Connection info
    entry_data = coordinator.config_entry.data if coordinator.config_entry else {}
    config["connection_type"] = entry_data.get("connection_type", "unknown")
    conn_type = config["connection_type"]
    if conn_type == "usb":
        config["connection_address"] = entry_data.get("usb_path", "")
    elif conn_type == "ble":
        config["connection_address"] = entry_data.get("ble_address", "")
    elif conn_type == "tcp":
        host = entry_data.get("tcp_host", "")
        port = entry_data.get("tcp_port", "")
        config["connection_address"] = f"{host}:{port}" if host else ""
    else:
        config["connection_address"] = ""

    connection.send_result(msg["id"], config)


# ─── PHASE 2: meshcore/set_device_config ────────────────────────────────
# Write companion device settings


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/set_device_config",
        vol.Optional("entry_id"): str,
        vol.Required("settings"): dict,
    }
)
@websocket_api.async_response
async def ws_set_device_config(hass, connection, msg):
    """Set companion device config."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    settings = msg.get("settings", {})
    changed = []

    try:
        # Handle name setting
        if "name" in settings:
            await coordinator.api.mesh_core.commands.set_name(settings["name"])
            changed.append("name")

        # Handle tx_power setting
        if "tx_power" in settings:
            await coordinator.api.mesh_core.commands.set_tx_power(settings["tx_power"])
            changed.append("tx_power")

        # Handle coordinates setting
        if "latitude" in settings and "longitude" in settings:
            await coordinator.api.mesh_core.commands.set_coords(
                settings["latitude"], settings["longitude"]
            )
            changed.append("coords")

        # Handle radio settings - all four must be provided together
        radio_keys = {"frequency", "bandwidth", "spreading_factor", "coding_rate"}
        if radio_keys & set(settings.keys()):
            # Read current values for any params not being changed
            self_info = getattr(coordinator.api, 'self_info', {}) or {}
            freq = settings.get("frequency", self_info.get("radio_freq"))
            bw = settings.get("bandwidth", self_info.get("radio_bw"))
            sf = settings.get("spreading_factor", self_info.get("radio_sf"))
            cr = settings.get("coding_rate", self_info.get("radio_cr"))

            if all(v is not None for v in [freq, bw, sf, cr]):
                await coordinator.api.mesh_core.commands.set_radio(freq, bw, sf, cr)
                changed.extend([k for k in radio_keys if k in settings])
            else:
                _LOGGER.warning("Cannot set radio: missing current values for unset params")

        # Handle path_hash_mode
        if "path_hash_mode" in settings:
            await coordinator.api.mesh_core.commands.set_path_hash_mode(settings["path_hash_mode"])
            changed.append("path_hash_mode")

        # Refresh self_info cache so subsequent reads return updated values
        if changed:
            try:
                appstart_result = await coordinator.api.mesh_core.commands.send_appstart()
                coordinator.api._cache_self_info_event(appstart_result)
            except Exception:
                _LOGGER.warning("Failed to refresh self_info after set_device_config")

        connection.send_result(msg["id"], {"success": True, "changed": changed})
    except Exception as ex:
        _LOGGER.error("Error setting device config: %s", ex)
        connection.send_error(
            msg["id"], "error", f"Failed to set device config: {str(ex)}"
        )


def _format_event_response(result) -> str:
    """Extract a user-friendly response string from an Event or raw value."""
    if result is None:
        return "OK"

    if not hasattr(result, 'payload'):
        return str(result) if result else "OK"

    payload = result.payload
    if not payload:
        return "OK"

    # Detect MSG_SENT ack payloads (have 'type' + 'expected_ack' keys)
    # These are just send confirmations, not actual device responses
    if isinstance(payload, dict) and 'expected_ack' in payload:
        return "Command sent"

    if isinstance(payload, dict):
        return json.dumps(payload)
    return str(payload)


# ─── PHASE 2: meshcore/execute_local ────────────────────────────────────
# Execute a Python library command on the companion


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/execute_local",
        vol.Optional("entry_id"): str,
        vol.Required("command"): str,
        vol.Optional("args"): dict,
    }
)
@websocket_api.async_response
async def ws_execute_local(hass, connection, msg):
    """Execute a local mesh_core command."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    command = msg.get("command")
    args = msg.get("args", {})

    try:
        # Get the command method from mesh_core.commands
        command_method = getattr(coordinator.api.mesh_core.commands, command, None)
        if not command_method:
            connection.send_error(
                msg["id"], "not_found", f"Command not found: {command}"
            )
            return

        # Execute the command with provided args
        response = await command_method(**args)
        timestamp = datetime.now().isoformat()

        # Extract meaningful text from Event objects
        resp_text = _format_event_response(response)

        connection.send_result(
            msg["id"],
            {"response": resp_text, "success": True, "timestamp": timestamp},
        )
    except Exception as ex:
        _LOGGER.error("Error executing local command %s: %s", command, ex)
        connection.send_error(
            msg["id"],
            "error",
            f"Failed to execute command {command}: {str(ex)}",
        )


# ─── PHASE 2: meshcore/execute_remote ───────────────────────────────────
# Execute a CLI command on a managed device with auto-login


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/execute_remote",
        vol.Optional("entry_id"): str,
        vol.Required("target_prefix"): str,
        vol.Required("command"): str,
    }
)
@websocket_api.async_response
async def ws_execute_remote(hass, connection, msg):
    """Execute a remote command on a managed device."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    target_prefix = msg.get("target_prefix")
    command = msg.get("command")

    try:
        # Find the device by pubkey_prefix in tracked repeaters and clients
        device = None
        password = None

        for repeater in coordinator._tracked_repeaters:
            if repeater.get("pubkey_prefix") == target_prefix:
                device = repeater
                password = repeater.get("password")
                break

        if not device:
            for client in coordinator._tracked_clients:
                if client.get("pubkey_prefix") == target_prefix:
                    device = client
                    break

        if not device:
            connection.send_error(
                msg["id"],
                "not_found",
                f"Device not found: {target_prefix}",
            )
            return

        # Get the contact for this device
        contact = coordinator.api.mesh_core.get_contact_by_key_prefix(target_prefix)
        if not contact:
            connection.send_error(
                msg["id"],
                "not_found",
                f"Contact not found for device: {target_prefix}",
            )
            return

        # Send login if password is available
        if password:
            login_result = await coordinator.api.mesh_core.commands.send_login(
                contact, password
            )
            # Wait a moment for login to be processed
            await hass.async_add_executor_job(time.sleep, 0.5)

        # Send the command
        cmd_result = await coordinator.api.mesh_core.commands.send_cmd(
            contact, command
        )

        timestamp = datetime.now().isoformat()

        # Extract meaningful text from Event objects
        resp_text = _format_event_response(cmd_result)

        connection.send_result(
            msg["id"],
            {"response": resp_text, "success": True, "timestamp": timestamp},
        )
    except Exception as ex:
        _LOGGER.error("Error executing remote command on %s: %s", target_prefix, ex)
        connection.send_error(
            msg["id"],
            "error",
            f"Failed to execute remote command: {str(ex)}",
        )


# ─── PHASE 2: meshcore/set_channel ──────────────────────────────────────
# Add or update a channel


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/set_channel",
        vol.Optional("entry_id"): str,
        vol.Required("channel_idx"): int,
        vol.Required("name"): str,
        vol.Optional("key"): str,
    }
)
@websocket_api.async_response
async def ws_set_channel(hass, connection, msg):
    """Set or update a channel."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    channel_idx = msg.get("channel_idx")
    name = msg.get("name")
    key = msg.get("key")

    try:
        # The SDK's set_channel expects channel_secret as None (to auto-derive
        # from the channel name) or exactly 16 raw bytes.  Passing a hex string
        # causes a ValueError because len(hex_str) != 16.
        if key:
            # Custom key from UI is a 64-char hex string → convert to 16 bytes
            channel_secret = bytes.fromhex(key)[:16]
        else:
            # Let the SDK auto-derive the key from the channel name
            channel_secret = None

        # Call set_channel command
        result = await coordinator.api.mesh_core.commands.set_channel(
            channel_idx, name, channel_secret
        )

        # Re-fetch channel info so coordinator state matches the device
        await coordinator._fetch_all_channel_info()
        coordinator.async_set_updated_data(coordinator.data)

        # Notify listeners (frontend subscribes to refresh its channel list).
        # Without this, a panel on another tab/client stays stale until its
        # next manual reload.  F02 in the 2026-04 forensics report.
        hass.bus.async_fire(
            f"{MESHCORE_DOMAIN}_channels_updated",
            {"entry_id": coordinator.config_entry.entry_id, "channel_idx": channel_idx},
        )

        connection.send_result(msg["id"], {"success": True})
    except Exception as ex:
        _LOGGER.error("Error setting channel %d: %s", channel_idx, ex)
        connection.send_error(
            msg["id"],
            "error",
            f"Failed to set channel: {str(ex)}",
        )


# ─── PHASE 2: meshcore/remove_channel ───────────────────────────────────
# Clear a channel slot


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/remove_channel",
        vol.Optional("entry_id"): str,
        vol.Required("channel_idx"): int,
    }
)
@websocket_api.async_response
async def ws_remove_channel(hass, connection, msg):
    """Remove a channel."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    channel_idx = msg.get("channel_idx")

    try:
        # Clear the channel by setting empty name; pass None for key so the
        # SDK auto-derives it (passing "" causes ValueError — SDK expects
        # None or 16 raw bytes, not an empty string).
        result = await coordinator.api.mesh_core.commands.set_channel(
            channel_idx, "", None
        )

        # Re-fetch channel info so coordinator state matches the device
        await coordinator._fetch_all_channel_info()
        coordinator.async_set_updated_data(coordinator.data)

        # Notify listeners (frontend subscribes to refresh its channel list).
        # F02 in the 2026-04 forensics report.
        hass.bus.async_fire(
            f"{MESHCORE_DOMAIN}_channel_removed",
            {"entry_id": coordinator.config_entry.entry_id, "channel_idx": channel_idx},
        )

        connection.send_result(msg["id"], {"success": True})
    except Exception as ex:
        _LOGGER.error("Error removing channel %d: %s", channel_idx, ex)
        connection.send_error(
            msg["id"],
            "error",
            f"Failed to remove channel: {str(ex)}",
        )


# ─── PHASE 3: meshcore/get_neighbors ────────────────────────────────────
# Get neighbor data for a repeater


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_neighbors",
        vol.Optional("entry_id"): str,
        vol.Required("target_prefix"): str,
    }
)
@callback
def ws_get_neighbors(hass, connection, msg):
    """Get neighbor data for a repeater."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    target_prefix = msg.get("target_prefix")

    neighbors = []
    neighbor_data = getattr(coordinator, '_repeater_neighbors', {}).get(target_prefix, {})
    now = time.time()
    cutoff_48h = now - 48 * 3600

    for key, data in neighbor_data.items():
        if data is None:
            continue
        # Always re-resolve live — stored resolved_name may be stale hex prefix
        # from before the contact was discovered
        resolved_name = coordinator.resolve_neighbor_name(key)
        # Compute actual last-heard time: last_updated is when HA polled,
        # secs_ago is how long before that the repeater heard the neighbor
        last_updated = data.get("last_updated", 0)
        secs_ago = data.get("secs_ago", 0)
        last_heard = last_updated - secs_ago if last_updated > 0 else 0
        if isinstance(last_heard, (int, float)) and last_heard > 0:
            last_seen_iso = datetime.fromtimestamp(last_heard).isoformat()
        else:
            last_seen_iso = ""
        # Prune seen_timestamps at read time — the write-time pruning only
        # runs during active polling, so stale entries can persist
        seen_timestamps = data.get("seen_timestamps", [])
        seen_48h = len([t for t in seen_timestamps if t > cutoff_48h])
        neighbors.append({
            "name": resolved_name,
            "pubkey_prefix": key,
            "snr": data.get("snr"),
            "last_seen": last_seen_iso,
            "secs_ago": data.get("secs_ago"),
            "seen_48h": seen_48h,
        })

    # Sort by SNR descending (strongest signal first)
    neighbors.sort(key=lambda n: n.get("snr") or -999, reverse=True)

    connection.send_result(msg["id"], {"neighbors": neighbors})


# ─── meshcore/remove_neighbor ────────────────────────────────────────────

@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/remove_neighbor",
        vol.Optional("entry_id"): str,
        vol.Required("target_prefix"): str,
        vol.Required("neighbor_pubkey"): str,
    }
)
@websocket_api.async_response
async def ws_remove_neighbor(hass, connection, msg):
    """Remove a neighbor from a repeater and clean up HA entities."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    target_prefix = msg.get("target_prefix")
    neighbor_pubkey = msg.get("neighbor_pubkey")

    try:
        # Find the repeater and its password
        device = None
        password = None

        for repeater in coordinator._tracked_repeaters:
            if repeater.get("pubkey_prefix") == target_prefix:
                device = repeater
                password = repeater.get("password")
                break

        if not device:
            connection.send_error(
                msg["id"],
                "not_found",
                f"Repeater not found: {target_prefix}",
            )
            return

        # Get the contact for this repeater
        contact = coordinator.api.mesh_core.get_contact_by_key_prefix(target_prefix)
        if not contact:
            connection.send_error(
                msg["id"],
                "not_found",
                f"Contact not found for repeater: {target_prefix}",
            )
            return

        # Send login if password is available
        if password:
            await coordinator.api.mesh_core.commands.send_login(contact, password)
            await hass.async_add_executor_job(time.sleep, 0.5)

        # Send neighbor.remove command to the repeater
        cmd_result = await coordinator.api.mesh_core.commands.send_cmd(
            contact, f"neighbor.remove {neighbor_pubkey}"
        )

        resp_text = _format_event_response(cmd_result)

        # Remove neighbor entities and tracking from HA.
        #
        # Inlined from upstream feature/sidebar-panel
        # `coordinator.remove_single_neighbor` — that method was deliberately
        # removed from upstream main (commit 9211499) and is therefore absent
        # from the companion-supporting `dev/combined`. The companion still
        # exposes a remove-neighbor flow via meshcore_chat/remove_neighbor, so
        # we duplicate the small entity-cleanup + persistence sequence here.
        # TODO(v0.2): hoist into `coordinator_facade`.
        removed = 0
        try:
            from homeassistant.helpers import entity_registry as er
            entity_registry = er.async_get(hass)
            unique_id_prefix = (
                f"{coordinator.config_entry.entry_id}_repeater_{target_prefix}"
                f"_neighbor_{neighbor_pubkey[:12]}"
            )
            for entity in list(entity_registry.entities.values()):
                if entity.platform == MESHCORE_DOMAIN and (
                    entity.unique_id or ""
                ).startswith(unique_id_prefix):
                    _LOGGER.info(
                        "Removing neighbor entity: %s", entity.entity_id
                    )
                    entity_registry.async_remove(entity.entity_id)
                    removed += 1

            # In-memory bookkeeping mirroring the upstream method.
            repeater_neighbors = coordinator._repeater_neighbors.get(
                target_prefix, {}
            )
            if neighbor_pubkey in repeater_neighbors:
                del repeater_neighbors[neighbor_pubkey]

            sensor_key = f"{target_prefix}:{neighbor_pubkey}"
            coordinator._created_neighbor_sensors.discard(sensor_key)

            # Persist updated data (fire-and-forget, mirrors upstream).
            hass.async_create_task(coordinator._save_neighbor_data())
        except Exception as cleanup_ex:
            _LOGGER.warning(
                "Inlined remove_single_neighbor cleanup failed for %s/%s: %s",
                target_prefix[:6], neighbor_pubkey[:6], cleanup_ex,
            )

        connection.send_result(
            msg["id"],
            {
                "response": resp_text,
                "success": True,
                "entities_removed": removed,
            },
        )
    except Exception as ex:
        _LOGGER.error(
            "Error removing neighbor %s from repeater %s: %s",
            neighbor_pubkey[:6], target_prefix[:6], ex,
        )
        connection.send_error(
            msg["id"],
            "error",
            f"Failed to remove neighbor: {ex}",
        )


# ─── meshcore/cleanup_stale_neighbors ────────────────────────────────────

@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/cleanup_stale_neighbors",
        vol.Optional("entry_id"): str,
        vol.Optional("days_threshold"): vol.All(
            vol.Coerce(int), vol.Range(min=1, max=90)
        ),
    }
)
@websocket_api.async_response
async def ws_cleanup_stale_neighbors(hass, connection, msg):
    """Manually trigger cleanup of stale neighbor entries."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    from .const import DEFAULT_STALE_NEIGHBOR_DAYS

    days = msg.get("days_threshold", coordinator._stale_neighbor_days or DEFAULT_STALE_NEIGHBOR_DAYS)

    try:
        removed = await coordinator._cleanup_stale_neighbors(days)
        connection.send_result(
            msg["id"],
            {
                "removed": removed,
                "days_threshold": days,
                "success": True,
            },
        )
    except Exception as ex:
        _LOGGER.error("Error during stale neighbor cleanup: %s", ex)
        connection.send_error(
            msg["id"],
            "error",
            f"Failed to cleanup stale neighbors: {ex}",
        )


# ─── PHASE 4: Unread Tracking ────────────────────────────────────────────


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_unread_counts",
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_get_unread_counts(hass, connection, msg):
    """Get all unread message counts."""
    tracker = hass.data.get(DOMAIN, {}).get("unread_tracker")
    if not tracker:
        connection.send_result(msg["id"], {"unread": {}})
        return
    connection.send_result(msg["id"], {"unread": tracker.get_all_unread()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/mark_conversation_read",
        vol.Optional("entry_id"): str,
        vol.Required("entity_id"): str,
    }
)
@websocket_api.async_response
async def ws_mark_read(hass, connection, msg):
    """Mark a conversation as read."""
    tracker = hass.data.get(DOMAIN, {}).get("unread_tracker")
    if tracker:
        await tracker.mark_read(msg["entity_id"])
    connection.send_result(msg["id"], {"success": True})


# ─── PHASE 4: Identity Management ────────────────────────────────────────


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/regenerate_identity",
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_regenerate_identity(hass, connection, msg):
    """Regenerate device identity (new public key)."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    try:
        await coordinator.api.mesh_core.commands.regenerate_key()
        self_info = getattr(coordinator.api, "self_info", {}) or {}
        new_pubkey = self_info.get("pubkey", "unknown")
        connection.send_result(msg["id"], {
            "success": True,
            "new_pubkey": new_pubkey,
            "warning": "All contacts must re-add this device with the new public key.",
        })
    except Exception as ex:
        _LOGGER.error("Error regenerating identity: %s", ex)
        connection.send_error(msg["id"], "error", f"Failed: {str(ex)}")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/import_identity",
        vol.Optional("entry_id"): str,
        vol.Required("private_key"): str,
    }
)
@websocket_api.async_response
async def ws_import_identity(hass, connection, msg):
    """Import a private key to restore identity."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    try:
        await coordinator.api.mesh_core.commands.import_key(msg["private_key"])
        self_info = getattr(coordinator.api, "self_info", {}) or {}
        connection.send_result(msg["id"], {
            "success": True,
            "pubkey": self_info.get("pubkey", "unknown"),
        })
    except Exception as ex:
        _LOGGER.error("Error importing identity: %s", ex)
        connection.send_error(msg["id"], "error", f"Failed: {str(ex)}")


# ─── PHASE 4: Location Source ─────────────────────────────────────────────


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/set_location_source",
        vol.Optional("entry_id"): str,
        vol.Required("source"): str,
    }
)
@websocket_api.async_response
async def ws_set_location_source(hass, connection, msg):
    """Set the location source for the device."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    source = msg["source"]
    valid_sources = ("none", "manual", "gps", "ha_location")
    if source not in valid_sources:
        connection.send_error(msg["id"], "invalid", f"Source must be one of: {valid_sources}")
        return

    coordinator.location_source = source
    connection.send_result(msg["id"], {"success": True})


# ─── Contact Management ──────────────────────────────────────────────────


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/add_contact",
        vol.Required("public_key"): str,
        vol.Optional("name"): str,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_add_contact(hass, connection, msg):
    """Add a discovered contact to the node's contact list."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    public_key = msg["public_key"]

    # Look up contact in discovered contacts
    contact_data = None
    for full_pk, disc in coordinator._discovered_contacts.items():
        if full_pk.startswith(public_key) or public_key.startswith(full_pk[:12]):
            contact_data = dict(disc)
            contact_data.setdefault("public_key", full_pk)
            break

    if not contact_data:
        # Try contacts dict as fallback
        prefix = public_key[:12]
        if prefix in coordinator._contacts:
            connection.send_error(msg["id"], "already_added", "Contact is already added to node")
            return
        connection.send_error(msg["id"], "not_found", f"Contact {public_key[:12]} not found in discovered contacts")
        return

    # Execute the SDK add_contact command
    try:
        api = coordinator.api
        if not api.connected or not api.mesh_core:
            connection.send_error(msg["id"], "not_connected", "Device not connected")
            return

        result = await api.mesh_core.commands.add_contact(contact_data)

        from meshcore.events import EventType
        if result.type == EventType.ERROR:
            connection.send_error(msg["id"], "command_failed", f"add_contact failed: {result.payload}")
            return

        # Post-command: sync coordinator state (same logic as services.py)
        api.mesh_core._contacts_dirty = True
        pubkey = contact_data.get("public_key", "")
        if pubkey:
            contact_data["added_to_node"] = True
            prefix = pubkey[:12]
            if prefix not in coordinator._contacts:
                coordinator._contacts[prefix] = contact_data

            coordinator.mark_contact_dirty(prefix)

            # Note: companion does not directly create the binary_sensor
            # entity for the new contact. The upstream meshcore integration
            # has a NEW_CONTACT event handler that creates the entity when
            # the SDK fires NEW_CONTACT after add_contact succeeds.

            # Trigger immediate update
            updated_data = dict(coordinator.data) if coordinator.data else {}
            updated_data["contacts"] = coordinator.get_all_contacts()
            coordinator.async_set_updated_data(updated_data)

        connection.send_result(msg["id"], {"success": True})

    except Exception as ex:
        _LOGGER.error("Error in ws_add_contact: %s", ex)
        connection.send_error(msg["id"], "error", str(ex))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/remove_contact",
        vol.Required("public_key"): str,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_remove_contact(hass, connection, msg):
    """Remove a contact from the node's contact list."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    public_key = msg["public_key"]
    prefix = public_key[:12]

    # Look up contact in coordinator's contacts
    contact_data = coordinator._contacts.get(prefix)
    if not contact_data:
        # Try matching by longer key
        for pk, c in coordinator._contacts.items():
            full_pk = c.get("public_key", "")
            if full_pk.startswith(public_key) or public_key.startswith(full_pk[:12]):
                contact_data = c
                prefix = pk
                break

    if not contact_data:
        connection.send_error(msg["id"], "not_found", f"Contact {public_key[:12]} not found in added contacts")
        return

    # Execute the SDK remove_contact command
    try:
        api = coordinator.api
        if not api.connected or not api.mesh_core:
            connection.send_error(msg["id"], "not_connected", "Device not connected")
            return

        result = await api.mesh_core.commands.remove_contact(contact_data)

        from meshcore.events import EventType
        if result.type == EventType.ERROR:
            connection.send_error(msg["id"], "command_failed", f"remove_contact failed: {result.payload}")
            return

        # Post-command: sync coordinator state (same logic as services.py)
        api.mesh_core._contacts_dirty = True
        pubkey = contact_data.get("public_key", "")
        if pubkey:
            # Remove from SDK internal dict
            if pubkey in api.mesh_core._contacts:
                del api.mesh_core._contacts[pubkey]

            # Remove from coordinator
            if prefix in coordinator._contacts:
                del coordinator._contacts[prefix]

            coordinator.mark_contact_dirty(prefix)

            # Trigger immediate update
            updated_data = dict(coordinator.data) if coordinator.data else {}
            updated_data["contacts"] = coordinator.get_all_contacts()
            coordinator.async_set_updated_data(updated_data)

        connection.send_result(msg["id"], {"success": True})

    except Exception as ex:
        _LOGGER.error("Error in ws_remove_contact: %s", ex)
        connection.send_error(msg["id"], "error", str(ex))


# ─── meshcore/trace ─────────────────────────────────────────────────
# Runs a MeshCore trace against a contact and measures round-trip time.
# Uses send_trace SDK method with a random tag for correlation.


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/trace",
        vol.Required("pubkey_prefix"): str,
        vol.Optional("entry_id"): str,
        # Optional comma-separated hex hops, e.g. "86,AE".  When provided,
        # backend skips path discovery and calls send_trace() with this path
        # directly.  Absent/empty → existing path-discovery behavior.
        vol.Optional("path"): str,
    }
)
@websocket_api.async_response
async def ws_trace(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Run a trace against a contact and measure round-trip time."""
    import asyncio
    import random

    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No active MeshCore coordinator")
        return

    api = coordinator.api
    if not api.connected or not api.mesh_core:
        connection.send_error(msg["id"], "not_connected", "Device not connected")
        return

    pubkey_prefix = msg["pubkey_prefix"]

    # Resolve contact to get public key bytes for the trace path.
    # get_contact_by_prefix searches both added and discovered contacts; a
    # miss here means this node's advertisement was never seen by the
    # source device, so trace has nothing to work with.
    contact = coordinator.get_contact_by_prefix(pubkey_prefix)
    if not contact:
        connection.send_error(
            msg["id"],
            "not_in_mesh",
            f"No mesh record for {pubkey_prefix} — the device must have seen this node's advertisement at least once to trace it.",
        )
        return

    # Firmware's CMD_SEND_PATH_DISCOVERY_REQ handler (MeshCore/examples/
    # companion_radio/MyMesh.cpp:1564-1592) looks up the target contact by
    # full-pubkey memcmp against its on-device contact array.  Discovered-only
    # contacts live in HA's _discovered_contacts dict but are never pushed to
    # the radio's contact table, so firmware responds ERR_CODE_NOT_FOUND
    # immediately.  Fail fast with an actionable message instead of making the
    # round-trip just to decode a firmware "not found".
    if not contact.get("added_to_node"):
        connection.send_error(
            msg["id"],
            "contact_not_on_device",
            "This contact isn't on your device yet — the device can only trace contacts it's stored. "
            "Add the contact to the device first, then try trace again.",
        )
        return

    try:
        # Generate random tag for correlating the response
        tag = random.randint(0, 0xFFFFFFFF)

        # Build the trace path from the contact's known outbound route.
        #
        # A trace packet's `path` argument is a sequence of per-hop repeater
        # hashes along the route to the target, NOT the target's own pubkey.
        # The contact entry carries the route the device last used to reach
        # this contact as (out_path_len, out_path_hash_mode, out_path):
        #   - out_path_len           number of hops; -1 means flood (no known path)
        #   - out_path_hash_mode     0/1/2 → hash size 1/2/4 bytes per hop
        #   - out_path               hex of the path bytes (already null-stripped)
        out_path_len = contact.get("out_path_len", -1)
        out_path_hash_mode = contact.get("out_path_hash_mode", 0)

        # User-supplied path overrides any stored or to-be-discovered route.
        # Session 53 DEBUG capture (2026-04-20) showed that multi-hop flood
        # path discovery does not reliably return a PATH_RESPONSE for all
        # reachable targets (e.g. Otay RPTR via ca.cv.main-st: firmware
        # accepts + broadcasts the request, but no response ever arrives).
        # The native MeshCoreOne iOS app works around this by letting the
        # user type the hop sequence manually; this branch mirrors that
        # workaround.  send_trace() accepts "xx,yy" hex strings directly
        # and derives its flags byte from the hop-hash length, so we can
        # pass the user's input through unchanged.
        explicit_path = msg.get("path")
        if explicit_path:
            hops = [h.strip() for h in explicit_path.split(",") if h.strip()]
            out_path_len = len(hops)
            # Derive hash_mode from the first hop's length (all hops must
            # share the same length; send_trace() will re-validate).
            # 2 hex chars = 1 byte = mode 0, 4 chars = 2 bytes = mode 1, etc.
            hop_hash_len = (len(hops[0]) // 2) if hops else 1
            out_path_hash_mode = {1: 0, 2: 1, 4: 2}.get(hop_hash_len, 0)
            _LOGGER.debug(
                "ws_trace: using explicit path for %s: %s (%d hops, hash_mode=%d)",
                pubkey_prefix, explicit_path, out_path_len, out_path_hash_mode,
            )
        elif out_path_len == -1:
            # Flood contact — the device has no cached path.  Run a
            # path-discovery pass first so we learn the outbound route,
            # then fall through to send_trace with the discovered path.
            _LOGGER.debug(
                "ws_trace: flood contact %s; issuing path discovery",
                pubkey_prefix,
            )
            try:
                dst_bytes = bytes.fromhex(contact["public_key"])
            except (KeyError, ValueError) as ex:
                connection.send_error(
                    msg["id"], "error",
                    f"Contact has no usable public key for path discovery: {ex}",
                )
                return

            # Two-step path discovery so we can distinguish immediate
            # firmware rejection (ERROR with a reason) from a real
            # PATH_RESPONSE timeout.  send_path_discovery_sync() collapses
            # both outcomes to None, which made every failure look like a
            # timeout even when the firmware had told us exactly why it
            # refused the request.
            #
            # Start the PATH_RESPONSE listener BEFORE sending the PATH_REQ
            # so there is no window in which the response could arrive and
            # be dispatched before our subscription is installed.  Filter
            # by target pubkey_prefix so concurrent path-discovery traffic
            # for other contacts can't satisfy this wait with a stale or
            # unrelated payload.  Mirrors Remote-Terminal-for-MeshCore's
            # approach at app/routers/contacts.py:443-458.
            import asyncio as _asyncio
            from meshcore.events import EventType as _EventType
            path_response_task = _asyncio.create_task(
                api.mesh_core.dispatcher.wait_for_event(
                    _EventType.PATH_RESPONSE,
                    attribute_filters={"pubkey_pre": pubkey_prefix},
                    timeout=30.0,  # outer safety; real bound set below
                )
            )
            pd_data = b"\x34\x00" + dst_bytes
            send_result = await api.mesh_core.commands.send(
                pd_data,
                [_EventType.MSG_SENT, _EventType.ERROR],
            )
            if send_result is None:
                _LOGGER.debug(
                    "ws_trace: path discovery got no reply from firmware layer for %s",
                    pubkey_prefix,
                )
                path_response_task.cancel()
                connection.send_error(
                    msg["id"],
                    "path_discovery_failed",
                    "Device did not acknowledge the path-discovery request.",
                )
                return
            if getattr(send_result, "type", None) == _EventType.ERROR:
                # Firmware PacketType.ERROR carries {"error_code", "code_string"}
                # per meshcore_py/src/meshcore/reader.py:85-94 (code_string from
                # events.py:71 ErrorMessages when the byte is mapped).  The
                # reader's internal parse-failure dispatches at reader.py
                # 402/412/426/433/448/456/477/481 use {"reason"} instead —
                # accept either shape and fall back to error_code for unmapped
                # codes so the user sees something actionable.
                reason = "unknown"
                if isinstance(send_result.payload, dict):
                    p = send_result.payload
                    reason = (
                        p.get("code_string")
                        or p.get("reason")
                        or (f"error_code={p['error_code']}" if "error_code" in p else "unknown")
                    )
                elif send_result.payload is not None:
                    reason = repr(send_result.payload)
                _LOGGER.debug(
                    "ws_trace: path discovery rejected by firmware for %s: %s (payload=%r)",
                    pubkey_prefix, reason, send_result.payload,
                )
                path_response_task.cancel()
                connection.send_error(
                    msg["id"],
                    "path_discovery_rejected",
                    f"Node rejected path-discovery request: {reason}",
                )
                return
            # MSG_SENT — firmware accepted and broadcast the request.
            # Wait on the pre-created listener task created above.  Raise
            # the floor from 4.0s (Session 51b default) to 15.0s to match
            # Remote-Terminal-for-MeshCore (app/routers/contacts.py:447):
            # two-hop flood PATH_REQ + PATH_RESPONSE round-trips are
            # routinely in the 5-12s range under real LoRa conditions, so
            # 4s gave up before the mesh had reasonable time to answer.
            # Honor firmware's suggested_timeout if it ever exceeds 15s,
            # but never use a shorter budget.
            suggested_ms = 0
            if isinstance(send_result.payload, dict):
                suggested_ms = send_result.payload.get("suggested_timeout", 0) or 0
            pd_timeout = max(suggested_ms / 800.0, 15.0)
            _LOGGER.debug(
                "ws_trace: path discovery accepted for %s, waiting up to %.1fs for PATH_RESPONSE (suggested_timeout=%s)",
                pubkey_prefix, pd_timeout, suggested_ms,
            )
            try:
                path_event = await _asyncio.wait_for(
                    path_response_task, timeout=pd_timeout,
                )
            except _asyncio.TimeoutError:
                path_response_task.cancel()
                path_event = None
            if path_event is None:
                connection.send_error(
                    msg["id"],
                    "path_discovery_timeout",
                    f"No PATH_RESPONSE within {pd_timeout:.1f}s — the contact did not reply. Try again later.",
                )
                return

            # PATH_RESPONSE payload carries the discovered outbound route.
            # meshcore_py/reader.py:847-868 populates out_path_len,
            # out_path_hash_len, and out_path on the event but does NOT
            # update the contact record, so we read these straight off the
            # event payload instead of re-fetching the contact.
            discovered = path_event.payload or {}
            out_path_len = discovered.get("out_path_len", -1)
            if out_path_len < 0:
                # Malformed PATH_RESPONSE (no out_path_len).  A real
                # 0-hop (direct-neighbor) discovery is now handled by
                # the round-trip path construction below — target
                # consumes the single hash + retransmits, sender
                # receives it — so we only reject the malformed case.
                connection.send_error(
                    msg["id"],
                    "path_discovery_failed",
                    "Path discovery response was malformed (missing out_path_len).",
                )
                return

            out_path_hash_len = discovered.get("out_path_hash_len", 1)
            # hash_mode 0/1/2 → 1/2/4 bytes; derive mode from length.
            out_path_hash_mode = {1: 0, 2: 1, 4: 2}.get(out_path_hash_len, 0)
            out_path_hex_full = discovered.get("out_path", "") or ""
            # Override contact-derived values so the existing path-bytes
            # construction below uses the discovered route.
            contact = {
                **contact,
                "out_path_len": out_path_len,
                "out_path_hash_mode": out_path_hash_mode,
                "out_path": out_path_hex_full,
            }

        if explicit_path:
            # Pass the user's comma-hex string through unchanged — send_trace()
            # parses it internally and its debug log shows the exact input
            # verbatim, which aids diagnosis if a typo slips through.
            #
            # Session 55 Addendum 2: pass flags=None so the SDK derives
            # flags from the user's per-hop hex width
            # (meshcore_py/messaging.py:249-268).  Forcing a pre-computed
            # flags value here breaks explicit input whose width doesn't
            # match the contact's cached hash mode.
            trace_path_arg = explicit_path
            flags = None
        else:
            # Session 55 Addendum 1: round-trip path construction.  TRACE
            # protocol (Mesh.cpp:41-66) only fires onTraceRecv on nodes
            # where (path_len << path_sz) >= len.  For the sender to
            # receive the trace result, the hash list must round-trip
            # back to the sender's radio range — i.e. outbound hops +
            # target + reverse(outbound hops).  Packet.cpp:41-50 mixes
            # path_len into the TRACE packet hash, so repeated hashes
            # don't trigger hasSeen dedup at mirror hops.
            #
            # 0-hop direct-neighbor case: outbound_hops is empty, so the
            # round-trip collapses to just [target_hash].  The target
            # consumes the single hash, appends SNR, retransmits; the
            # retransmit is received by the sender.
            #
            # Session 55 Addendum 2: force 1-byte hashes (flags=0)
            # regardless of the contact's cached out_path_hash_mode.
            # 2-byte traces fail to complete round-trip in production
            # meshes (empirically observed vs MeshCoreOne, which uses
            # 1-byte and succeeds).  Root cause in firmware not
            # identified; decision based on MeshCoreOne-matches-works,
            # 2-byte-fails.
            flags = 0
            path_hash_len = 1 << flags  # = 1 byte
            target_pubkey_hex = (contact.get("public_key", "") or "")
            target_hash_hex = target_pubkey_hex[: path_hash_len * 2]  # first 1 byte
            if not target_hash_hex:
                connection.send_error(
                    msg["id"], "error",
                    "Contact has no public key; cannot construct trace target hash.",
                )
                return
            # The stored out_path is in the contact's cached hash mode
            # width.  We want 1-byte hops, so take the first 2 hex chars
            # (1 byte) of each stored hop regardless of stored width.
            out_path_hex = (contact.get("out_path", "") or "")
            stored_hop_width = {0: 2, 1: 4, 2: 8}.get(out_path_hash_mode, 2)
            outbound_hops = []
            for i in range(out_path_len):
                start = i * stored_hop_width
                stored_hop = out_path_hex[start : start + stored_hop_width]
                if len(stored_hop) >= 2:
                    outbound_hops.append(stored_hop[:2])  # truncate to 1 byte
            return_hops = list(reversed(outbound_hops))
            full_path_hex = (
                "".join(outbound_hops) + target_hash_hex + "".join(return_hops)
            )
            trace_path_arg = bytes.fromhex(full_path_hex)
            _LOGGER.debug(
                "ws_trace: round-trip path for %s: hops=%s target=%s (full=%s, flags=0)",
                pubkey_prefix, outbound_hops, target_hash_hex, full_path_hex,
            )

        start_time = time.monotonic()

        # Set up a future to capture the trace response.
        #
        # TRACE_DATA events flow through forward_all_events() in __init__.py,
        # which re-fires every SDK event on the HA bus as `meshcore_raw_event`
        # with `{event_type: str, payload: dict, timestamp: float}`.  The
        # payload shape for a trace response (meshcore_py/reader.py:645-696):
        #
        #   {
        #     "tag": int,
        #     "auth": int,
        #     "flags": int,
        #     "path_len": int,           # hop count (0 = direct reception)
        #     "path": [                  # only present when path_len > 0
        #       {"hash": "xx", "snr": float},  # per intermediate hop
        #       ...,
        #       {"snr": float}           # final node (this device), no hash
        #     ]
        #   }
        response_future: asyncio.Future = hass.loop.create_future()

        def _on_raw_event(event):
            """Listen for TRACE_DATA events and match on our tag."""
            data = event.data or {}
            event_type = data.get("event_type", "") or ""
            # str(EventType.TRACE_DATA) yields "EventType.TRACE_DATA"; use
            # substring match so both the enum-repr and bare-value forms work.
            if "TRACE_DATA" not in event_type:
                return
            payload = data.get("payload") or {}
            if payload.get("tag") == tag and not response_future.done():
                response_future.set_result(payload)

        # Subscribe to the catch-all raw-event bus; TRACE_DATA is dispatched
        # here by forward_all_events() in __init__.py.
        unsub = hass.bus.async_listen(f"{MESHCORE_DOMAIN}_raw_event", _on_raw_event)

        try:
            # Send trace request: auth_code=0, tag, flags, path.
            #
            # send_trace() returns an Event: MSG_SENT on success, ERROR on
            # immediate SDK- or firmware-layer rejection (e.g. invalid path
            # format, unsupported path type, firmware length check failure).
            # Without inspecting the return, an immediate rejection looks
            # identical to "packet sent but response never came" — we'd wait
            # the full 15 s before reporting a generic timeout.
            from meshcore.events import EventType as _EventType
            # Render the path argument for the log: string for explicit,
            # hex() for bytes from the discovery/cached branch.
            _log_path = trace_path_arg if isinstance(trace_path_arg, str) else trace_path_arg.hex()
            _LOGGER.debug(
                "ws_trace: sending trace tag=%08x flags=%s path=%s (out_path_len=%d, explicit=%s)",
                tag, ("auto" if flags is None else flags), _log_path, out_path_len, bool(explicit_path),
            )
            send_result = await api.mesh_core.commands.send_trace(0, tag, flags, trace_path_arg)
            if send_result is None or getattr(send_result, "type", None) == _EventType.ERROR:
                reason = "no_response"
                if send_result is not None and isinstance(send_result.payload, dict):
                    reason = send_result.payload.get("reason", "unknown")
                _LOGGER.debug("ws_trace: send_trace rejected by SDK/firmware: %s", reason)
                connection.send_error(
                    msg["id"],
                    "send_failed",
                    f"Device rejected trace: {reason}",
                )
                return

            # Wait for response with timeout
            timeout_ms = (api.self_info or {}).get("suggested_timeout", 15000)
            timeout_s = min(max(timeout_ms / 1000.0 * 1.2, 5.0), 60.0)

            try:
                response_data = await asyncio.wait_for(response_future, timeout=timeout_s)
                elapsed = time.monotonic() - start_time
                round_trip_ms = int(elapsed * 1000)

                # Path is only populated when path_len > 0.  When path_len
                # is 0 (direct reception), final_snr is unknown.
                path = response_data.get("path") or []
                # The final entry in path[] is the local device's SNR on
                # receiving the trace echo; earlier entries carry per-hop
                # SNRs on the return leg.
                final_snr = None
                if path and "snr" in path[-1]:
                    final_snr = path[-1]["snr"]

                connection.send_result(msg["id"], {
                    "round_trip_ms": round_trip_ms,
                    "response_time": f"{round_trip_ms}ms",
                    "hops": response_data.get("path_len", 0),
                    "final_snr": final_snr,
                    "path": path,
                })
            except asyncio.TimeoutError:
                connection.send_error(msg["id"], "timeout", "Trace timed out — no response received")
        finally:
            unsub()

    except Exception as ex:
        _LOGGER.error("Error in ws_trace: %s", ex)
        connection.send_error(msg["id"], "error", str(ex))


# ─── meshcore/get_blocked_contacts ──────────────────────────────────
# Returns list of locally blocked contacts. Blocking is a client-side
# UI preference stored in coordinator, not a device-level operation.


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_blocked_contacts",
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_get_blocked_contacts(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Return list of contacts that have been blocked locally."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No active MeshCore coordinator")
        return

    # _blocked_contacts is a set of pubkey prefixes
    blocked_prefixes = getattr(coordinator, "_blocked_contacts", set())
    all_contacts = coordinator.get_all_contacts()

    blocked = [
        c for c in all_contacts
        if c.get("public_key", "")[:12] in blocked_prefixes
    ]

    connection.send_result(msg["id"], {"contacts": blocked})


# ─── meshcore/set_contact_blocked ───────────────────────────────────
# Toggles the blocked state of a contact. This is a local UI preference
# stored on the coordinator — no SDK call is made to the device.


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/set_contact_blocked",
        vol.Required("public_key"): str,
        vol.Required("blocked"): bool,
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_set_contact_blocked(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Set or clear the blocked flag on a contact (local UI preference)."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No active MeshCore coordinator")
        return

    public_key = msg["public_key"]
    blocked = msg["blocked"]

    # Initialize blocked set if not present
    if not hasattr(coordinator, "_blocked_contacts"):
        coordinator._blocked_contacts = set()

    prefix = public_key[:12]

    if blocked:
        coordinator._blocked_contacts.add(prefix)
    else:
        coordinator._blocked_contacts.discard(prefix)

    connection.send_result(msg["id"], {"success": True})


# ================================================================
# Message Store commands
# ================================================================


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_stored_messages",
        vol.Required("entity_id"): str,
        vol.Optional("limit", default=50): int,
        vol.Optional("before"): str,
        vol.Optional("after"): str,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_get_stored_messages(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Get stored messages for a conversation with cursor pagination.

    Routes through the *companion's* MessageStore (per-entry; lives on
    hass.data[DOMAIN]), not the upstream coordinator. ``entry_id`` here
    is the companion's entry id (typically a singleton).
    """
    store = _get_store(hass, msg.get("entry_id"))
    if store is None:
        connection.send_error(
            msg["id"], "not_found", "No MeshCore Chat message store found"
        )
        return

    limit = msg.get("limit", 50)
    messages = await store.get_messages(
        msg["entity_id"],
        limit=limit,
        before=msg.get("before"),
        after=msg.get("after"),
    )
    connection.send_result(
        msg["id"],
        {"messages": messages, "has_more": len(messages) == limit},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_stored_message_count",
        vol.Required("entity_id"): str,
        vol.Optional("entry_id"): str,
    }
)
@callback
def ws_get_stored_message_count(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Get message count for a conversation from the in-memory index.

    Routes through the companion's MessageStore.
    """
    store = _get_store(hass, msg.get("entry_id"))
    if store is None:
        connection.send_error(
            msg["id"], "not_found", "No MeshCore Chat message store found"
        )
        return

    index_entry = store.get_message_index().get(msg["entity_id"], {})
    connection.send_result(
        msg["id"], {"count": index_entry.get("message_count", 0)}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/search_stored_messages",
        vol.Required("query"): str,
        vol.Optional("entity_id"): str,
        vol.Optional("from_date"): str,
        vol.Optional("to_date"): str,
        vol.Optional("limit", default=20): int,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_search_stored_messages(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Search stored messages by text or sender name.

    Uses _load_for_search() for non-caching disk reads — conversations
    loaded solely for search are not kept in memory after the call returns.
    """
    store = _get_store(hass, msg.get("entry_id"))
    if store is None:
        connection.send_error(
            msg["id"], "not_found", "No MeshCore Chat message store found"
        )
        return

    query = msg["query"].lower()
    from_date = msg.get("from_date")
    to_date = msg.get("to_date")
    results = []
    limit = msg.get("limit", 20)

    entities = (
        [msg["entity_id"]] if msg.get("entity_id")
        else list(store.get_message_index().keys())
    )
    for eid in entities:
        messages = await store._load_for_search(eid)

        # Resolve conversation name from HA entity state
        state = hass.states.get(eid)
        conv_name = state.attributes.get("friendly_name", eid) if state else eid

        for m in reversed(messages):
            ts = m.get("timestamp", "")

            # Date range filtering
            if from_date and ts < from_date:
                continue
            if to_date and ts > to_date:
                continue

            if query in (m.get("text", "")).lower() or query in (m.get("sender", "")).lower():
                results.append({
                    **m,
                    "entity_id": eid,
                    "conversation_name": conv_name,
                })
                if len(results) >= limit:
                    break
        if len(results) >= limit:
            break

    connection.send_result(msg["id"], {"results": results})
