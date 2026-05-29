"""MeshCore Chat WebSocket API.

Lifted from the upstream meshcore integration's ws_api.py for the
companion integration. All type strings are namespaced under
meshcore_chat/* to avoid collision with upstream meshcore/* commands.
Coordinator state lookups go via hass.data[MESHCORE_DOMAIN] because the
chat panel acts as a consumer of the upstream meshcore integration's
coordinator.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir

from . import MeshCoreChatRuntimeData, _sync_upstream_repair_issue
from .const import (
    CONF_NAME_UPSTREAM,
    DOMAIN,
    ENTITY_DOMAIN_BINARY_SENSOR,
    MESHCORE_DOMAIN,
)
from .message_store import MessageStore
from .utils import format_entity_id, sanitize_name

_LOGGER = logging.getLogger(__name__)


# ─── Exception translations ──────────────────────────────────────────────
#
# `strings.json` and `translations/en.json` carry the canonical user-facing
# exception messages keyed under the top-level ``exceptions`` block. The
# WS error path looks them up via ``_t(translation_key)``.
#
# Today the lookup resolves against the bundled ``translations/en.json``
# at module import — single locale, no per-user resolution. The hard-
# coded fallback dict (``_EXCEPTION_FALLBACKS``) keeps the call path
# resilient if the JSON shape changes or the file is missing in some
# distribution scenarios.
#
# Future direction: when Home Assistant's translation API gains stable
# Python-side support for non-entity contexts (WS handlers, in
# particular), replace ``_t(key)`` with the API call and feed it the
# active user's language. The translation keys used by ``_WS_ERROR_MAP``
# are deliberately stable so the future swap touches only the helper
# body — not the call sites or the ``strings.json`` schema.
#
# Reference: https://developers.home-assistant.io/docs/internationalization/core
# (the ``async_get_exception_message`` helper covers entity / device
# contexts but is not yet a clean fit for ad-hoc WS-handler errors).

_EXCEPTION_FALLBACKS: dict[str, str] = {
    "operation_failed": "Operation failed",
    "device_not_connected": "Device not connected",
    "operation_timed_out": "Operation timed out",
    "invalid_request": "Invalid request parameters",
    "no_meshcore_coordinator": "No active MeshCore coordinator",
}


def _load_bundled_exception_messages() -> dict[str, str]:
    """Load ``exceptions.<key>.message`` from the bundled en translations.

    Falls back to ``_EXCEPTION_FALLBACKS`` if the file is missing,
    malformed, or a key is absent. This keeps the WS error path
    resilient — a missing translation never raises, it just degrades to
    the hard-coded English string.
    """
    path = Path(__file__).parent / "translations" / "en.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        block = data.get("exceptions") or {}
    except (OSError, ValueError):  # pragma: no cover - defensive
        return dict(_EXCEPTION_FALLBACKS)

    resolved = dict(_EXCEPTION_FALLBACKS)
    for key, entry in block.items():
        if isinstance(entry, dict):
            message = entry.get("message")
            if isinstance(message, str) and message:
                resolved[key] = message
    return resolved


_EXCEPTION_MESSAGES: dict[str, str] = _load_bundled_exception_messages()


def _t(key: str) -> str:
    """Look up a translated exception message.

    Today: returns the en-locale literal from the bundled
    ``translations/en.json`` (loaded once at import). Falls back to the
    hard-coded English string in ``_EXCEPTION_FALLBACKS`` if the key is
    absent. Never raises.

    Future: integrate with HA's translation infrastructure for per-user
    locale resolution. See the module-level comment above.
    """
    return _EXCEPTION_MESSAGES.get(key) or _EXCEPTION_FALLBACKS.get(key) or key


def _resolve_coordinator(hass: HomeAssistant, entry_id: str | None = None):
    """Discovery-only: locate the upstream meshcore coordinator.

    Pure lookup — no side effects. The wrapper ``_get_coordinator`` is
    the public-ish entry point that adds the repair-issue sync; this
    inner helper is what callers use when they need the discovery result
    without triggering the issue create/delete (currently only the
    wrapper itself).

    Behavior:
      - ``entry_id`` supplied and matches a registered coordinator → return it.
      - ``entry_id`` supplied but no match → log WARNING and return None.
        This is a frontend bug (wrong field passed as entry_id, stale
        entry_id after an upstream entry was removed, etc.) and should
        surface as a ``not_found`` WS error, not silently masquerade as
        the first coordinator.
      - ``entry_id`` omitted (None) → fall back to first coordinator.
        This is the legitimate "I don't care which one" path used by
        commands that operate on singleton state.

    Note on scope: this hardening only protects code paths that actually
    call ``_get_coordinator(...)`` / ``_resolve_coordinator(...)``. Handlers
    that accept ``entry_id`` in their schema but ignore it at the body
    level (SILENT-IGNORE — caught by
    ``tests/components/meshcore_chat/test_ws_api_entry_id_audit.py``)
    or route through a different resolver (e.g., ``_get_store`` — see
    its symmetric hardening for the chat-companion lookup) need their
    own coverage.
    """
    if MESHCORE_DOMAIN not in hass.data:
        return None

    if entry_id is not None:
        coord = hass.data[MESHCORE_DOMAIN].get(entry_id)
        if coord is None:
            _LOGGER.warning(
                "ws_api received unknown entry_id %r; valid: %s",
                entry_id, list(hass.data[MESHCORE_DOMAIN]),
            )
            return None
        return coord if hasattr(coord, "api") else None

    # entry_id explicitly omitted — fall back to first coordinator.
    for value in hass.data[MESHCORE_DOMAIN].values():
        if hasattr(value, "api"):
            return value
    return None


def _resolve_all_coordinators(hass: HomeAssistant) -> list:
    """Discovery-only: enumerate all active upstream coordinators.

    Pure lookup — no side effects. See ``_resolve_coordinator`` doc for
    the inner-vs-wrapper split.
    """
    if MESHCORE_DOMAIN not in hass.data:
        return []
    return [
        (entry_id, coord)
        for entry_id, coord in hass.data[MESHCORE_DOMAIN].items()
        if hasattr(coord, "api")
    ]


def _get_coordinator(hass: HomeAssistant, entry_id: str | None = None):
    """Get the upstream meshcore coordinator for ``entry_id``, or first available.

    The companion does not own a coordinator — it consumes the upstream
    integration's coordinator via ``hass.data[MESHCORE_DOMAIN][meshcore_entry_id]``.
    The ``entry_id`` argument here, when supplied by the frontend, is the
    *upstream* meshcore config-entry id (the chat panel discovers it via the
    ``meshcore_chat/get_devices`` command, which in turn reads upstream's
    coordinator registry). When omitted, the first registered upstream
    coordinator is used.

    Side effect: synchronizes the ``upstream_meshcore_unavailable`` repair
    issue based on what discovery just observed. Idempotent (HA dedupes
    by (domain, issue_id); delete-on-non-existent is a no-op), so the
    panel-polling rate is safe.
    """
    coord = _resolve_coordinator(hass, entry_id)
    _sync_upstream_repair_issue(hass)
    return coord


def _get_all_coordinators(hass: HomeAssistant) -> list:
    """Get all active upstream coordinators.

    Side effect: synchronizes the ``upstream_meshcore_unavailable`` repair
    issue based on what discovery just observed (see ``_get_coordinator``
    for the rationale).
    """
    coords = _resolve_all_coordinators(hass)
    _sync_upstream_repair_issue(hass)
    return coords


# Maps Python exception types to WS error codes + translation keys.
# Order matters — first match wins. Add new entries above the catch-all
# in ``_ws_send_error_safe`` to surface specific failures before they
# fall through to "error".
#
# The third tuple element is a translation key from ``strings.json``'s
# ``exceptions`` block, not a literal message. ``_ws_send_error_safe``
# resolves it via ``_t(key)`` so the user-facing text lives in
# ``strings.json`` / ``translations/en.json`` rather than scattered
# across the code. The WS error *codes* (the second
# tuple element) are unchanged — clients keying on ``timeout`` /
# ``not_connected`` / ``invalid`` continue to work.
_WS_ERROR_MAP: list[tuple[type[BaseException], str, str]] = [
    (asyncio.TimeoutError, "timeout", "operation_timed_out"),
    (ConnectionError, "not_connected", "device_not_connected"),
    (vol.Invalid, "invalid", "invalid_request"),
]


def _ws_send_error_safe(
    connection: websocket_api.ActiveConnection,
    msg_id: int,
    ex: Exception,
    *,
    handler: str,
    default_code: str = "error",
    default_translation_key: str = "operation_failed",
) -> None:
    """Log a WS handler exception with context and send a generic error.

    Logs the full traceback at ERROR level for diagnosis. Sends a generic
    user-facing message to the client — internal exception strings (which
    may include path info, SDK details, or stack-trace fragments) are
    deliberately not echoed.

    User-facing messages are resolved via ``_t(translation_key)`` so the
    canonical text lives in ``strings.json`` / ``translations/en.json``
    rather than literal strings inline.
    """
    _LOGGER.exception("%s failed: %s", handler, ex)
    for exc_type, code, translation_key in _WS_ERROR_MAP:
        if isinstance(ex, exc_type):
            connection.send_error(msg_id, code, _t(translation_key))
            return
    connection.send_error(msg_id, default_code, _t(default_translation_key))


# One-shot guard so the legacy-fallback warning fires at most once per
# process — without this, a busy panel that polls contacts every few
# seconds against an old meshcore install would flood the log.
_LEGACY_CONTACTS_FALLBACK_LOGGED = False


async def _get_contacts_via_service(
    hass: HomeAssistant, entry_id: str | None = None
) -> list | None:
    """Fetch contacts via the documented meshcore.get_contacts service.

    Returns the contacts list on success, an empty list when the service
    reports an error envelope (no_coordinator / coordinator_error), or
    None when there is no MeshCore coordinator at all (caller maps to
    "not_found"). Callers that need to distinguish "no coordinator" from
    "service-side error" should inspect the legacy direct-coordinator
    path instead — but in practice the chat panel just shows a generic
    "no coordinator" toast in either case.

    Falls back to ``coordinator.get_all_contacts()`` on installs running
    meshcore<2.6.0 (no service registered), so existing users don't lose
    contact-list functionality during the version-floor announcement
    window. The fallback warning is logged at most once per process.
    """
    if not hass.services.has_service(MESHCORE_DOMAIN, "get_contacts"):
        global _LEGACY_CONTACTS_FALLBACK_LOGGED
        if not _LEGACY_CONTACTS_FALLBACK_LOGGED:
            _LOGGER.warning(
                "meshcore.get_contacts service not registered — falling back "
                "to coordinator.get_all_contacts(). Upgrade to meshcore>=2.6.0 "
                "for the documented public surface."
            )
            _LEGACY_CONTACTS_FALLBACK_LOGGED = True
        coordinator = _get_coordinator(hass, entry_id)
        if not coordinator:
            return None
        return list(coordinator.get_all_contacts() or [])

    service_data: dict = {}
    if entry_id:
        service_data["entry_id"] = entry_id

    try:
        result = await hass.services.async_call(
            MESHCORE_DOMAIN,
            "get_contacts",
            service_data,
            blocking=True,
            return_response=True,
        )
    except Exception as ex:
        _LOGGER.error("meshcore.get_contacts service call failed: %s", ex)
        return None

    if not result:
        return None
    # Service returns {"contacts": [...]} on success and
    # {"contacts": [], "error": "..."} on error envelopes. Treat either
    # as "no usable data" by checking for a non-empty list before the
    # presence-of-error flag — the chat doesn't surface the upstream
    # error string today, so collapse to the existing "not_found" UX.
    if "error" in result and not result.get("contacts"):
        return None
    return list(result.get("contacts") or [])


def _get_store(
    hass: HomeAssistant, entry_id: str | None = None
) -> MessageStore | None:
    """Return the companion's per-entry MessageStore.

    Per-entry state lives on ``entry.runtime_data`` (Bronze convention,
    post-2024.6). ``entry_id`` here is the *companion's* config-entry id
    (typically a singleton per HA instance because the panel is installed
    once). When omitted, falls back to the first companion config entry
    that has a runtime_data store.

    Defensive ``getattr`` shields the isinstance check from entries
    belonging to other integrations: HA's ``ConfigEntry`` only
    materialises ``runtime_data`` on the entry whose setup populated it,
    so a direct attribute read on a non-companion entry raises
    AttributeError. Frontend call sites occasionally pass the parent
    ``meshcore`` integration's entry_id (rather than the chat
    companion's) — bringing that down the same code path was the source
    of a runtime crash; ``getattr`` collapses the miss to a clean None.

    Behavior:
      - ``entry_id`` supplied and resolves to a chat-companion entry
        → return its store.
      - ``entry_id`` supplied but does NOT resolve to a chat-companion
        entry → log WARNING and return None. Mirrors the
        ``_resolve_coordinator`` hardening for the parallel chat-
        companion lookup path. This branch previously returned None
        silently, masking wrong-shape entry_ids.
      - ``entry_id`` omitted (``None``) → fall back to first companion
        entry with a store. This is the legitimate path used by
        ``ws_mark_read`` / ``ws_get_messages_around`` and the three
        handlers (``ws_get_stored_messages``,
        ``ws_get_stored_message_count``, ``ws_search_stored_messages``)
        whose documented-ignore conversion forces the
        ``None``-fallback explicitly.
    """
    if entry_id is not None:
        entry = hass.config_entries.async_get_entry(entry_id)
        if entry is None or not isinstance(
            getattr(entry, "runtime_data", None), MeshCoreChatRuntimeData
        ):
            _LOGGER.warning(
                "ws_api _get_store received entry_id %r that is not a chat companion entry",
                entry_id,
            )
            return None
        return entry.runtime_data.store

    # Fallback: first companion entry with a store.
    for entry in hass.config_entries.async_entries(DOMAIN):
        if isinstance(
            getattr(entry, "runtime_data", None), MeshCoreChatRuntimeData
        ):
            return entry.runtime_data.store
    return None


def async_register_ws_commands(hass: HomeAssistant) -> None:
    """Register all MeshCore Chat WebSocket commands."""
    # Device / contact / channel read commands
    websocket_api.async_register_command(hass, ws_get_devices)
    websocket_api.async_register_command(hass, ws_get_contacts)
    websocket_api.async_register_command(hass, ws_get_channels)

    # Device config and command-execution commands
    websocket_api.async_register_command(hass, ws_get_managed_devices)
    websocket_api.async_register_command(hass, ws_get_device_config)
    websocket_api.async_register_command(hass, ws_set_device_config)
    websocket_api.async_register_command(hass, ws_execute_local)
    websocket_api.async_register_command(hass, ws_execute_remote)
    websocket_api.async_register_command(hass, ws_set_channel)
    websocket_api.async_register_command(hass, ws_remove_channel)

    # Neighbor management commands
    websocket_api.async_register_command(hass, ws_get_neighbors)
    websocket_api.async_register_command(hass, ws_remove_neighbor)
    websocket_api.async_register_command(hass, ws_cleanup_stale_neighbors)

    # Unread, identity, location, and contact commands
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
    websocket_api.async_register_command(hass, ws_get_messages_around)

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
@websocket_api.async_response
async def ws_get_contacts(hass, connection, msg):
    """Return all contacts for the specified (or first) config entry.

    Delegates to the upstream meshcore.get_contacts service (PR #216,
    meshcore>=2.6.0), with a legacy fallback to
    coordinator.get_all_contacts() for users on older meshcore — see
    _get_contacts_via_service.
    """
    contacts = await _get_contacts_via_service(hass, msg.get("entry_id"))
    if contacts is None:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return
    connection.send_result(msg["id"], {"contacts": contacts})


# ─── meshcore/get_contacts_paginated ─────────────────────────────────
# Returns paginated, filtered contacts with type counts.


def _compute_type_counts(contacts: list) -> dict:
    """Compute per-type counts for a list of contacts.

    Inlined from the upstream meshcore coordinator
    (`_compute_type_counts` static method). The upstream coordinator this
    companion consumes deliberately omits `get_contacts_paginated` /
    `get_node_counts`, so the companion duplicates the small amount of
    logic that operates on the public `get_all_contacts()` payload.
    TODO: refactor into a single `coordinator_facade` module.
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
@websocket_api.async_response
async def ws_get_contacts_paginated(hass, connection, msg):
    """Return paginated contacts with filtering and type counts.

    Filters/sorts/paginates the contact list returned by upstream's
    meshcore.get_contacts service (PR #216, meshcore>=2.6.0). The
    upstream service deliberately doesn't ship a paginated/filtered
    variant — companions own this layer.
    """
    all_contacts = await _get_contacts_via_service(hass, msg.get("entry_id"))
    if all_contacts is None:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    category = msg["category"]
    node_type = msg.get("node_type")
    search = msg.get("search")
    limit = msg["limit"]
    offset = msg["offset"]
    sort_by = msg["sort_by"]

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
@websocket_api.async_response
async def ws_get_node_counts(hass, connection, msg):
    """Return node counts for each primary filter category.

    Counts are derived from the contact list returned by upstream's
    meshcore.get_contacts service (PR #216, meshcore>=2.6.0). Like
    paginated, this filtering layer is owned by the companion.
    """
    all_contacts = await _get_contacts_via_service(hass, msg.get("entry_id"))
    if all_contacts is None:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

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
@websocket_api.require_admin
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


# ─── meshcore/get_managed_devices ───────────────────────────────────────
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


# ─── meshcore/get_device_config ─────────────────────────────────────────
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


# ─── meshcore/set_device_config ─────────────────────────────────────────
# Write companion device settings


class RenameError(Exception):
    """Raised when the device firmware rejects a ``set_name`` command.

    Mirrors :class:`IdentityImportError` but for the rename path. Carries
    the firmware-reported error code (e.g. ``firmware rejected new name:
    ERR_CODE_ILLEGAL_ARG``). Surfaced via
    ``connection.send_error(..., "rename_rejected", str(ex))`` so the
    frontend gets the actual rejection reason instead of a generic
    "Operation failed" via ``_ws_send_error_safe``'s default mapping.

    The direct-SDK + ``EventType.ERROR``-check pattern used by the
    identity-change path is mirrored here on the rename path so the same
    silent-success-on-firmware-error issue cannot recur.
    """


def _migrate_entity_ids_name_suffix(
    hass: HomeAssistant,
    meshcore_entry_id: str,
    old_suffix: str,
    new_suffix: str,
) -> list[tuple[str, str]]:
    """Rewrite entity_ids ending in ``_{old_suffix}`` to end in ``_{new_suffix}``.

    Walks the HA entity registry, filters by the meshcore
    ``config_entry_id``, and rewrites ``entity_id`` via
    ``entity_registry.async_update_entity``. Returns a list of
    ``(old_entity_id, new_entity_id)`` pairs for every successful
    rewrite — caller uses this to populate the ``entity_list``
    placeholder of the ``name_changed`` repair issue so the user can
    see exactly which entity_ids changed.

    Companion to PR #169's ``_migrate_entity_ids`` in ``meshcore-ha`` —
    same pattern, but operates on the trailing **name suffix** (where
    ``set_name`` impacts entity_ids per ``utils.py:format_entity_id``)
    instead of the leading **pubkey prefix** (where
    ``import_private_key`` impacts entity_ids). The two migrations are
    independent and never conflict.

    Idempotent on identical or empty suffixes (no mutations, returns
    empty list). Errors on individual entities are logged and
    swallowed — one bad entity should not abort the whole migration.
    """
    if not old_suffix or not new_suffix or old_suffix == new_suffix:
        return []
    registry = er.async_get(hass)
    old_tail = f"_{old_suffix}"
    new_tail = f"_{new_suffix}"
    migrated: list[tuple[str, str]] = []
    for entity in list(registry.entities.values()):
        if entity.config_entry_id != meshcore_entry_id:
            continue
        if not entity.entity_id.endswith(old_tail):
            continue
        old_entity_id = entity.entity_id
        new_entity_id = old_entity_id[: -len(old_tail)] + new_tail
        try:
            registry.async_update_entity(
                old_entity_id, new_entity_id=new_entity_id
            )
            _LOGGER.info(
                "Migrated entity_id: %s -> %s",
                old_entity_id, new_entity_id,
            )
            migrated.append((old_entity_id, new_entity_id))
        except Exception as ex:  # pragma: no cover - defensive
            _LOGGER.error(
                "Failed to migrate entity %s: %s", old_entity_id, ex
            )
    _LOGGER.info(
        "Migrated %d entity_id(s): _%s -> _%s",
        len(migrated), old_suffix, new_suffix,
    )
    return migrated


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/set_device_config",
        vol.Optional("entry_id"): str,
        vol.Required("settings"): dict,
    }
)
@websocket_api.require_admin
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
        # Handle name setting (with entity_id migration).
        if "name" in settings:
            new_name = settings["name"]
            old_name = coordinator.name or ""
            meshcore_entry = hass.config_entries.async_get_entry(
                coordinator.config_entry.entry_id
            )

            # Direct SDK call + EventType.ERROR check (mirrors the
            # identity-change path's `_do_identity_change`). Avoids the
            # silent-success-on-firmware-error path that would otherwise
            # let a rejected rename look like a successful one to the user.
            #
            # The `EventType` import is lazy so SDK-level failures
            # (ConnectionError, TimeoutError, etc.) raised by `set_name`
            # propagate through the outer `except` without first
            # tripping a missing-meshcore-package import in test envs.
            result = await coordinator.api.mesh_core.commands.set_name(new_name)
            # Short-circuit None first so we don't need the meshcore.events
            # import on the never-responded path (defensive: lets tests
            # exercise the no-Event case without the patched_event_type
            # fixture).
            if result is None:
                raise RenameError("firmware rejected new name: unknown")
            from meshcore.events import EventType
            if getattr(result, "type", None) == EventType.ERROR:
                payload = getattr(result, "payload", None) or {}
                code = (
                    payload.get("code_string")
                    or payload.get("error_code")
                    or "unknown"
                )
                raise RenameError(f"firmware rejected new name: {code}")
            changed.append("name")

            # Run the migration only if the name actually changed and we
            # resolved the upstream meshcore config entry. The reload at
            # the end re-inits the coordinator with the new CONF_NAME —
            # `coordinator.name` (set-once at construction per
            # `coordinator.py:104`) ends up correct after the reload.
            if new_name != old_name and meshcore_entry:
                # Order: registry rewrite → entry-data update → repair
                # issue → reload. Reverse order would silently no-op the
                # migration: HA matches by unique_id during entity
                # re-registration on reload, finds the OLD entity_id in
                # the registry, and preserves it.
                old_suffix = sanitize_name(old_name)
                new_suffix = sanitize_name(new_name)
                migrated_pairs = _migrate_entity_ids_name_suffix(
                    hass,
                    meshcore_entry.entry_id,
                    old_suffix,
                    new_suffix,
                )
                hass.config_entries.async_update_entry(
                    meshcore_entry,
                    data={**meshcore_entry.data, CONF_NAME_UPSTREAM: new_name},
                )
                if migrated_pairs:
                    # Markdown bullet list of every (old_id → new_id)
                    # pair so the repair issue surfaces a complete
                    # search-replace target list to the user.
                    entity_list = "\n".join(
                        f"- `{old_id}` → `{new_id}`"
                        for old_id, new_id in migrated_pairs
                    )
                    # Unique issue_id per rename event so each rename
                    # becomes its own audit-trail entry. An earlier
                    # design (issue_id keyed only on entry_id) was
                    # idempotent on
                    # ``(domain, issue_id)`` — but HA's
                    # ``async_create_issue`` preserves the
                    # ``dismissed_version`` flag across overwrites,
                    # so once the user dismissed any rename's issue
                    # all subsequent renames silently wrote into a
                    # dismissed shell. With a timestamped
                    # issue_id, every rename surfaces a fresh,
                    # un-dismissed event the user can act on or
                    # dismiss individually.
                    rename_ts = int(time.time())
                    issue_id = (
                        f"name_changed_{meshcore_entry.entry_id}_{rename_ts}"
                    )
                    ir.async_create_issue(
                        hass,
                        DOMAIN,
                        issue_id,
                        is_fixable=False,
                        is_persistent=True,
                        severity=ir.IssueSeverity.WARNING,
                        translation_key="name_changed",
                        translation_placeholders={
                            # Raw human-readable names for the prose.
                            "old_name": old_name,
                            "new_name": new_name,
                            # Sanitized suffixes — what actually
                            # appears in entity_ids. An earlier bug
                            # used `_{old_name}` /
                            # `_{new_name}` which rendered as
                            # `_MattDub` / `_Test Rename` instead of
                            # the real `_mattdub` / `_test_rename`.
                            "old_suffix": old_suffix,
                            "new_suffix": new_suffix,
                            "count": str(len(migrated_pairs)),
                            "entity_list": entity_list,
                        },
                    )
                # Reload triggers meshcore's `async_setup_entry` which
                # reconstructs `coordinator.name` and `device_info` from
                # the updated entry data.
                #
                # meshcore-ha registers an
                # `entry.add_update_listener(async_update_options)` at
                # `__init__.py:473` that also calls `async_reload` on
                # data changes. HA's per-entry `setup_lock` serializes
                # the listener-driven reload behind ours; net effect is
                # one redundant reload per rename (~1s extra latency,
                # idempotent). Acceptable for an infrequent rename op.
                await hass.config_entries.async_reload(meshcore_entry.entry_id)
                # The reload reconstructed the coordinator + entities;
                # the post-loop self_info refresh below would run
                # against the soon-to-be-discarded coord. Skip it.
                #
                # The `rename` block carries the migration summary back
                # to the panel so it can render the post-rename
                # persistent dialog (matches the repair-issue text
                # minus the bullet list — that's already in
                # Settings → Repairs and would dwarf the dialog).
                # Toast alone was too easy to miss for an op that
                # rewrites 12+ entity_ids and triggers an integration
                # reload.
                connection.send_result(
                    msg["id"],
                    {
                        "success": True,
                        "changed": changed,
                        "rename": {
                            "old_name": old_name,
                            "new_name": new_name,
                            "old_suffix": old_suffix,
                            "new_suffix": new_suffix,
                            "count": len(migrated_pairs),
                        },
                    },
                )
                return

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
    except RenameError as ex:
        # Surface the firmware-reported rejection text directly so the
        # user sees the actual reason (mirrors the `import_rejected`
        # surface for `IdentityImportError`).
        connection.send_error(msg["id"], "rename_rejected", str(ex))
    except Exception as ex:
        _ws_send_error_safe(
            connection, msg["id"], ex, handler="ws_set_device_config"
        )


def _json_safe(obj):
    """json.dumps ``default=`` hook: render bytes as hex (mirroring the
    integration's execute_command service) and fall back to str() for any other
    non-JSON-serializable value, so one odd field can't fail the whole response.
    Without this, a CHANNEL_INFO payload (whose channel_secret is raw 16-byte
    bytes) raises TypeError and the command surfaces as an opaque error."""
    if isinstance(obj, (bytes, bytearray)):
        return obj.hex()
    return str(obj)


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
        return json.dumps(payload, default=_json_safe)
    return str(payload)


# ─── meshcore/execute_local ─────────────────────────────────────────────
# Execute a Python library command on the companion


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/execute_local",
        vol.Optional("entry_id"): str,
        vol.Required("command"): str,
        vol.Optional("args"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_execute_local(hass, connection, msg):
    """Execute a local mesh_core command."""
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "No MeshCore coordinator found")
        return

    command = msg.get("command")
    args = msg.get("args", {})

    # Defense-in-depth against dunder-method invocation via getattr. The
    # frontend's commands/local-commands.ts catalogue is an *implicit*
    # allowlist; the WS surface itself accepts any method name. Without
    # this guard, an admin (or a future non-admin if require_admin is
    # ever loosened) could invoke methods like __init__ or any future
    # _internal_* SDK helper that becomes reachable through getattr.
    if not command or command.startswith("_"):
        connection.send_error(
            msg["id"], "invalid", f"Invalid command name: {command!r}"
        )
        return

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
        _ws_send_error_safe(
            connection, msg["id"], ex, handler=f"ws_execute_local({command!r})"
        )


# ─── meshcore/execute_remote ────────────────────────────────────────────
# Execute a CLI command on a managed device with auto-login


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/execute_remote",
        vol.Optional("entry_id"): str,
        vol.Required("target_prefix"): str,
        vol.Required("command"): str,
    }
)
@websocket_api.require_admin
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

        # Send login if password is available. send_login_sync blocks
        # until the node confirms login (LOGIN_SUCCESS) or the request
        # times out. A None return means login was not confirmed —
        # on the simple_repeater firmware a wrong password and a
        # transient timeout are indistinguishable on the wire (the
        # node silently ignores a bad login rather than emitting
        # LOGIN_FAILED), so we proceed with the command and annotate
        # the response so the user knows the login wasn't confirmed.
        login_unconfirmed = False
        if password:
            login_result = await coordinator.api.mesh_core.commands.send_login_sync(
                contact, password
            )
            login_unconfirmed = login_result is None

        # Send the command
        cmd_result = await coordinator.api.mesh_core.commands.send_cmd(
            contact, command
        )

        timestamp = datetime.now().isoformat()

        # Extract meaningful text from Event objects
        resp_text = _format_event_response(cmd_result)
        if login_unconfirmed:
            resp_text = f"Login not confirmed — {resp_text}"

        connection.send_result(
            msg["id"],
            {"response": resp_text, "success": True, "timestamp": timestamp},
        )
    except Exception as ex:
        _ws_send_error_safe(
            connection,
            msg["id"],
            ex,
            handler=f"ws_execute_remote({target_prefix!r})",
        )


# ─── meshcore/set_channel ───────────────────────────────────────────────
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
@websocket_api.require_admin
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
            # Custom key from UI is a 32-char hex string (16 bytes, AES-128).
            # No truncation: if the user supplies the wrong length, let the SDK
            # raise ValueError so the error surfaces instead of being masked.
            channel_secret = bytes.fromhex(key)
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
        # next manual reload.
        hass.bus.async_fire(
            f"{MESHCORE_DOMAIN}_channels_updated",
            {"entry_id": coordinator.config_entry.entry_id, "channel_idx": channel_idx},
        )

        connection.send_result(msg["id"], {"success": True})
    except Exception as ex:
        _ws_send_error_safe(
            connection,
            msg["id"],
            ex,
            handler=f"ws_set_channel(idx={channel_idx})",
        )


# ─── meshcore/remove_channel ────────────────────────────────────────────
# Clear a channel slot


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/remove_channel",
        vol.Optional("entry_id"): str,
        vol.Required("channel_idx"): int,
    }
)
@websocket_api.require_admin
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
        hass.bus.async_fire(
            f"{MESHCORE_DOMAIN}_channel_removed",
            {"entry_id": coordinator.config_entry.entry_id, "channel_idx": channel_idx},
        )

        connection.send_result(msg["id"], {"success": True})
    except Exception as ex:
        _ws_send_error_safe(
            connection,
            msg["id"],
            ex,
            handler=f"ws_remove_channel(idx={channel_idx})",
        )


# ─── meshcore/get_neighbors ─────────────────────────────────────────────
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
@websocket_api.require_admin
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

        # Send login if password is available. send_login_sync blocks
        # until the node confirms login (LOGIN_SUCCESS) or the request
        # times out. A None return means login was not confirmed —
        # on the simple_repeater firmware a wrong password and a
        # transient timeout are indistinguishable on the wire (the
        # node silently ignores a bad login rather than emitting
        # LOGIN_FAILED), so we proceed with the command and annotate
        # the response so the user knows the login wasn't confirmed.
        login_unconfirmed = False
        if password:
            login_result = await coordinator.api.mesh_core.commands.send_login_sync(
                contact, password
            )
            login_unconfirmed = login_result is None

        # Send neighbor.remove command to the repeater
        cmd_result = await coordinator.api.mesh_core.commands.send_cmd(
            contact, f"neighbor.remove {neighbor_pubkey}"
        )

        resp_text = _format_event_response(cmd_result)
        if login_unconfirmed:
            resp_text = f"Login not confirmed — {resp_text}"

        # Remove neighbor entities and tracking from HA.
        #
        # Inlined from the upstream meshcore integration's
        # `coordinator.remove_single_neighbor` — that method was deliberately
        # removed from upstream main in an earlier change and is therefore
        # absent from the upstream coordinator this companion consumes. The
        # companion still exposes a remove-neighbor flow via
        # meshcore_chat/remove_neighbor, so we duplicate the small
        # entity-cleanup + persistence sequence here.
        # TODO: hoist into `coordinator_facade`.
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

            # Persist updated data — await so that a failure surfaces in
            # the WS response rather than being silently logged via the
            # background-task harness.
            await coordinator._save_neighbor_data()
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
        _ws_send_error_safe(
            connection,
            msg["id"],
            ex,
            handler=(
                f"ws_remove_neighbor(neighbor={neighbor_pubkey[:6]}, "
                f"repeater={target_prefix[:6]})"
            ),
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
@websocket_api.require_admin
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
        _ws_send_error_safe(
            connection,
            msg["id"],
            ex,
            handler="ws_cleanup_stale_neighbors",
        )


# ─── Unread Tracking ─────────────────────────────────────────────────────


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_unread_counts",
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_get_unread_counts(hass, connection, msg):
    """Return unread counts and last-read cursors, optionally scoped to one entry.

    The payload includes a ``last_read`` map alongside ``unread`` so the
    panel can populate both badge counts and per-conversation anchors in
    a single round-trip on connect. Older clients that only read
    ``unread`` continue to work — the field is additive.

    When ``entry_id`` is supplied and resolves to a known upstream
    coordinator (via the tightened ``_resolve_coordinator``), the
    returned maps are filtered to entity_ids that belong to that
    coordinator (matched by the ``.meshcore_<pubkey-prefix>_`` segment).
    Unknown ``entry_id`` triggers the resolver's warning + None and we
    return empty maps so the panel surfaces a clean empty state instead
    of cross-contaminated counts from other entries. Omitted ``entry_id``
    returns the full process-wide map (legacy / cross-entry rollup
    callers).

    The ``unread`` map is derived from the persistent cursor + the
    message store rather than read from a
    separate in-memory counter. The wire shape
    (``{"unread": ..., "last_read": ...}``) is unchanged — entries
    with derived count > 0 are emitted, count == 0 is omitted, exactly
    matching the legacy behavior of ``get_all_unread()`` (which
    filtered ``v > 0``). Eliminates the desync class where the badge
    reset on HA restart while the cursor survived.
    """
    tracker = hass.data.get(DOMAIN, {}).get("unread_tracker")
    if not tracker:
        # Empty maps for both fields keeps the wire shape stable for
        # frontends written against the new schema, regardless of
        # whether the tracker is initialised.
        connection.send_result(msg["id"], {"unread": {}, "last_read": {}})
        return
    last_read = tracker.get_all_last_read()
    store = _get_store(hass, None)
    unread: dict[str, int] = {}
    if store is not None:
        # Walk every conversation the store knows about — the index
        # surfaces entity_ids without forcing a full conversation load.
        # ``count_unread_after`` lazy-loads the per-conversation file on
        # first count, but each conversation is loaded at most once per
        # round and cached for subsequent calls within this handler.
        for entity_id in list(store.get_message_index().keys()):
            cursor = last_read.get(entity_id)
            count = await store.count_unread_after(entity_id, cursor)
            if count > 0:
                unread[entity_id] = count
    entry_id = msg.get("entry_id")
    if entry_id is not None:
        coord = _resolve_coordinator(hass, entry_id)
        if coord is None:
            # The resolver already logged the warning; respond with empty.
            connection.send_result(msg["id"], {"unread": {}, "last_read": {}})
            return
        prefix = (getattr(coord, "pubkey", "") or "")[:6]
        if prefix:
            # Match the domain-boundary segment ".meshcore_<prefix>_"
            # against entity_ids of the form
            # "<domain>.meshcore_<prefix>_..._messages".
            # NOTE: a "_meshcore_<prefix>_" pattern would never match
            # because the character preceding "meshcore" in real
            # entity_ids is the domain separator ".", not "_".
            needle = f".meshcore_{prefix}_"
            unread = {k: v for k, v in unread.items() if needle in k}
            last_read = {k: v for k, v in last_read.items() if needle in k}
    connection.send_result(msg["id"], {"unread": unread, "last_read": last_read})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/mark_conversation_read",
        vol.Optional("entry_id"): str,
        vol.Required("entity_id"): str,
    }
)
@websocket_api.async_response
async def ws_mark_read(hass, connection, msg):
    """Mark a conversation as read and snapshot the last-read cursor.

    In addition to clearing the in-memory unread count, snapshot the
    newest stored message id at this moment as the persistent read
    cursor. The cursor is what the ``get_messages_around`` endpoint
    anchors on.

    ``get_messages(limit=1)`` returns ``messages[-1:]`` from the
    chronologically-sorted store (ordering is kept reliable
    via ``bisect.insort``). If the conversation has no stored messages
    yet (``recent`` empty), the cursor is left untouched — defensive
    no-op so the ``ack``-style success response still fires.

    The prior two-call sequence
    (``tracker.mark_read(entity_id)`` to clear the in-memory counter
    + ``tracker.set_last_read(entity_id, msg_id)`` to advance the
    cursor) collapses into a single ``mark_read(entity_id, msg_id)``
    call. The in-memory counter is gone — counts are derived from the
    cursor + store on demand. The single call advances the cursor,
    fires ``EVENT_UNREAD_UPDATED`` with ``unread_count=0``, and
    schedules the debounced disk save.

    The ``entry_id`` field on the inbound WS message is intentionally
    NOT forwarded to ``_get_store``: the chat panel's frontend often
    populates that field with the parent ``meshcore`` integration's
    entry id (the panel was originally configured against that), but
    this handler needs the chat companion's store. The chat companion
    is single-instance per its config flow, so the ``None``-fallback
    branch in ``_get_store`` deterministically resolves to the right
    store. Accepting the field keeps the WS schema backwards-
    compatible.
    """
    tracker = hass.data.get(DOMAIN, {}).get("unread_tracker")
    # Always use the fallback — see the docstring for the rationale.
    store = _get_store(hass, None)
    if tracker:
        # Resolve the new cursor from the store's chronologically-newest
        # stored message. ``None`` (no messages yet) leaves the cursor
        # untouched inside ``mark_read`` — defensive no-op.
        new_cursor: str | None = None
        if store is not None:
            recent = await store.get_messages(msg["entity_id"], limit=1)
            if recent:
                new_cursor = recent[0]["id"]
        await tracker.mark_read(msg["entity_id"], new_cursor)
    connection.send_result(msg["id"], {"success": True})


# ─── Identity Management ─────────────────────────────────────────────────
#
# This identity-import flow was redesigned after the original approach
# delegated to ``meshcore.execute_command`` and used the wrong key format
# (``seed || verify_key`` instead of the SHA-512-expanded clamped secret
# the firmware actually accepts), then silently swallowed firmware ERRORs
# because the service-call path had no surface to detect them. The
# ``return_response=True`` workaround tripped HA's framework validation
# on OK-with-empty-payload responses.
#
# The redesign abandons the service-delegation path and calls the SDK
# directly:
#
# 1. ``coord.api.mesh_core.commands.import_private_key(seed_bytes)`` —
#    direct SDK call returning an ``Event``. ``EventType.ERROR`` is
#    inspected and surfaced as ``IdentityImportError`` so the firmware's
#    rejection (e.g. ``ERR_CODE_ILLEGAL_ARG``) reaches the user instead
#    of getting buried as a false success.
# 2. ``send_appstart`` + ``_cache_self_info_event`` — replicates
#    services.py's ``_SELF_INFO_COMMANDS`` post-call refresh inline so we
#    don't depend on the service for the cache update.
# 3. ``coord.api.mesh_core.commands.reboot()`` — direct SDK call. The
#    firmware only switches identities on next boot.
# 4. Brief ``asyncio.sleep`` while transport-layer reconnect completes
#    (SDK ``connection_manager`` handles the reconnect itself).
# 5. ``hass.config_entries.async_reload(meshcore_entry_id)`` — fires the
#    pubkey-detection hook in upstream ``async_setup_entry``
#    (meshcore-ha PR #169, ``__init__.py:319-348``), which calls
#    ``_migrate_entity_ids(old_prefix, new_prefix)`` and creates the
#    ``pubkey_changed_<entry_id>`` repair issue automatically.
# 6. Verify-after-reload guard: re-resolve the coordinator and confirm
#    ``coord.pubkey != old_pubkey``. Belt-and-suspenders against any
#    "OK + reload + same pubkey" edge case where the firmware accepted
#    the import but failed to persist.
#
# Each step emits a streaming progress event so the panel modal can show
# a step checklist instead of a single toast — terminal state still uses
# ``send_result`` / ``send_error`` (the standard HA WS pattern;
# ``subscribeMessage`` on the frontend is the matching call).
#
# Key format: ``_seed_to_meshcore_priv(seed)`` expands a 32-byte Ed25519
# seed into the firmware's 64-byte expanded clamped secret form (RFC
# 8032 §5.1.5). Firmware-truth-derived; verified by scalar-mult parity
# against the device's stored pubkey.


class IdentityImportError(Exception):
    """Raised when an identity import does not take effect on the device.

    Carries a human-readable message describing the firmware-reported
    failure (e.g. ``firmware rejected key: ERR_CODE_ILLEGAL_ARG``) or
    the verify-after-reload mismatch. The WS handler surfaces this via
    ``connection.send_error(..., "import_rejected", str(ex))`` so the
    frontend modal can render the actual error text instead of a
    generic "failed" toast.
    """


def _seed_to_meshcore_priv(seed: bytes) -> bytes:
    """Expand a 32-byte Ed25519 seed into MeshCore's 64-byte private-key form.

    MeshCore firmware (``Identity.cpp:51`` ``validatePrivateKey``) calls
    ``ed25519_derive_pub`` on the 64-byte input — this only succeeds
    when the bytes are the Ed25519 *expanded clamped secret* form:
    SHA-512(seed) with byte[0] cleared in the lowest 3 bits, byte[31]
    cleared in the top bit and set in bit 6 (RFC 8032 §5.1.5).

    Verified live against firmware v1.14.1:
    scalar-mult of ``expanded[:32]`` by the Ed25519 base point yields
    the device's stored public key; ``expanded[0] & 7 == 0``;
    ``expanded[31]`` satisfies the clamping inequality.

    The PyNaCl / libsodium ``crypto_sign_seed_keypair`` "secret key" is
    ``seed || public_key``, NOT this expanded form — pushing that to
    ``import_private_key`` is rejected with ``ERR_CODE_ILLEGAL_ARG``.
    """
    if len(seed) != 32:
        raise ValueError(f"Ed25519 seed must be 32 bytes, got {len(seed)}")
    h = bytearray(hashlib.sha512(seed).digest())
    h[0] &= 0xF8
    h[31] &= 0x7F
    h[31] |= 0x40
    return bytes(h)


async def _do_identity_change(
    hass,
    connection,
    msg_id,
    coord,
    meshcore_entry_id,
    old_pubkey,
    seed_bytes,
):
    """Streaming-progress identity change.

    Emits one ``websocket_api.event_message`` per step; on terminal
    success calls ``connection.send_result``; on terminal failure
    raises ``IdentityImportError`` (caller surfaces via
    ``connection.send_error``). Caller is responsible for the initial
    ``{"step": "generating"}`` event — the source of seed bytes differs
    between regenerate (host-generate via ``os.urandom``) and import
    (user-supplied 64- or 128-char hex).

    ``seed_bytes`` is the firmware-native 64-byte expanded clamped
    secret. For 32-byte raw seeds use ``_seed_to_meshcore_priv``; for
    user-supplied 128-hex input pass ``bytes.fromhex(raw)`` directly
    (already firmware-native, matches ``export_private_key`` output).
    """
    from meshcore.events import EventType

    # Step 2 — import. Direct SDK call; inspect Event.type for ERROR
    # (the service path silently swallowed firmware errors and the
    # return_response=True workaround tripped HA's framework validation
    # on empty-payload OK responses).
    connection.send_message(
        websocket_api.event_message(msg_id, {"step": "importing"})
    )
    result = await coord.api.mesh_core.commands.import_private_key(seed_bytes)
    if result is None or getattr(result, "type", None) == EventType.ERROR:
        code = "unknown"
        if result is not None:
            payload = getattr(result, "payload", None) or {}
            code = payload.get("code_string") or payload.get("error_code") or "unknown"
        raise IdentityImportError(f"firmware rejected key: {code}")

    # Step 2b — refresh self_info (mimics services.py _SELF_INFO_COMMANDS
    # post-call refresh, services.py:656-664). Wrapped in try/except: pass
    # because the reload re-fetches anyway and a self_info hiccup
    # shouldn't abort the chain. The call itself must be present
    # (covered by a unit assertion).
    try:
        appstart = await coord.api.mesh_core.commands.send_appstart()
        coord.api._cache_self_info_event(appstart)
    except Exception:  # pragma: no cover - defensive
        _LOGGER.debug("self_info refresh after import_private_key failed; "
                      "the upcoming entry reload will re-fetch it")

    # Step 3 — reboot. Firmware only switches identity on next boot.
    connection.send_message(
        websocket_api.event_message(msg_id, {"step": "rebooting"})
    )
    await coord.api.mesh_core.commands.reboot()

    # Step 4 — wait for the device to come back. The SDK's
    # connection_manager handles transport-level reconnect; we just need
    # to not race the reload. 3 seconds is a placeholder.
    # TODO: replace with EventType.CONNECTED await once the SDK exposes
    # a clean reconnect-completed signal.
    connection.send_message(
        websocket_api.event_message(msg_id, {"step": "reconnecting"})
    )
    await asyncio.sleep(3.0)

    # Step 5 — reload the config entry. PR #169's async_setup_entry hook
    # detects the new pubkey and migrates entity IDs automatically.
    connection.send_message(
        websocket_api.event_message(msg_id, {"step": "reloading"})
    )
    await hass.config_entries.async_reload(meshcore_entry_id)

    # Step 6 — verify the pubkey actually changed. The
    # post-reload coordinator should reflect the new identity; if it
    # doesn't, the import didn't actually persist on the device and the
    # success path would be a lie.
    connection.send_message(
        websocket_api.event_message(msg_id, {"step": "verifying"})
    )
    new_coord = _get_coordinator(hass, meshcore_entry_id)
    new_pubkey = new_coord.pubkey if new_coord else None
    if not new_pubkey or new_pubkey == old_pubkey:
        raise IdentityImportError(
            "device pubkey unchanged after reload — import did not take effect"
        )

    # Terminal success — the data ride on a final ``done`` event_message
    # because ``home-assistant-js-websocket``'s ``subscribeMessage``
    # promise-resolves with the unsubscribe handle only and discards the
    # ``send_result`` payload (verified against
    # ``home-assistant-js-websocket/lib/connection.ts`` 2026-05). The
    # frontend wrapper unpacks the ``done`` event into the typed
    # ``IdentityFlowResult``.
    connection.send_message(
        websocket_api.event_message(
            msg_id,
            {
                "step": "done",
                "success": True,
                "old_pubkey": old_pubkey,
                "new_pubkey": new_pubkey,
                "warning": (
                    "Device rebooted with new identity. Entity IDs migrated. "
                    "All contacts must re-add this device."
                ),
            },
        )
    )
    connection.send_result(msg_id, {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/regenerate_identity",
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_regenerate_identity(hass, connection, msg):
    """Regenerate identity by host-generating a fresh seed and importing it.

    Streaming handler — emits one ``event_message`` per step
    (generating → importing → rebooting → reconnecting → reloading →
    verifying), then terminates with ``send_result`` (success) or
    ``send_error`` (failure). See ``_do_identity_change`` for the body.
    """
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", _t("no_meshcore_coordinator"))
        return

    meshcore_entry_id = coordinator.config_entry.entry_id
    old_pubkey = coordinator.pubkey

    try:
        # Step 1 — generate. Host-side fresh entropy via os.urandom →
        # /dev/urandom on Linux (PyNaCl no longer used here; the
        # SHA-512 + clamping happens in _seed_to_meshcore_priv).
        connection.send_message(
            websocket_api.event_message(msg["id"], {"step": "generating"})
        )
        seed_bytes = _seed_to_meshcore_priv(os.urandom(32))

        await _do_identity_change(
            hass,
            connection,
            msg["id"],
            coordinator,
            meshcore_entry_id,
            old_pubkey,
            seed_bytes,
        )
    except IdentityImportError as ex:
        connection.send_error(msg["id"], "import_rejected", str(ex))
    except Exception as ex:
        _ws_send_error_safe(
            connection, msg["id"], ex, handler="ws_regenerate_identity"
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/import_identity",
        vol.Optional("entry_id"): str,
        vol.Required("private_key"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_import_identity(hass, connection, msg):
    """Import a hex-encoded private key, reboot device, reload config entry.

    Streaming handler — see ``ws_regenerate_identity`` doc for the
    event-message contract.

    Accepts both 64-char (raw 32-byte Ed25519 seed; expanded host-side
    via ``_seed_to_meshcore_priv``) and 128-char (already firmware-
    native 64-byte expanded form, matches ``export_private_key`` output)
    inputs.
    """
    coordinator = _get_coordinator(hass, msg.get("entry_id"))
    if not coordinator:
        connection.send_error(msg["id"], "not_found", _t("no_meshcore_coordinator"))
        return

    # Strip whitespace anywhere in the input — paste-friendly.
    raw = msg["private_key"].strip().replace(" ", "").replace("\n", "")
    if len(raw) not in (64, 128) or len(raw) % 2 != 0:
        connection.send_error(msg["id"], "invalid", _t("invalid_key_length"))
        return
    try:
        raw_bytes = bytes.fromhex(raw)
    except ValueError:
        connection.send_error(msg["id"], "invalid", _t("invalid_key_hex"))
        return

    meshcore_entry_id = coordinator.config_entry.entry_id
    old_pubkey = coordinator.pubkey

    try:
        # Step 1 — generate (or expand). 32-byte input is treated as the
        # raw Ed25519 seed and expanded into the firmware-native 64-byte
        # form; 64-byte input is passed through unchanged (already in
        # the firmware native format that ``export_private_key``
        # returns).
        connection.send_message(
            websocket_api.event_message(msg["id"], {"step": "generating"})
        )
        if len(raw_bytes) == 32:
            seed_bytes = _seed_to_meshcore_priv(raw_bytes)
        else:
            seed_bytes = raw_bytes

        await _do_identity_change(
            hass,
            connection,
            msg["id"],
            coordinator,
            meshcore_entry_id,
            old_pubkey,
            seed_bytes,
        )
    except IdentityImportError as ex:
        connection.send_error(msg["id"], "import_rejected", str(ex))
    except Exception as ex:
        _ws_send_error_safe(
            connection, msg["id"], ex, handler="ws_import_identity"
        )


# ─── Location Source ──────────────────────────────────────────────────────


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/set_location_source",
        vol.Optional("entry_id"): str,
        vol.Required("source"): str,
    }
)
@websocket_api.require_admin
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
@websocket_api.require_admin
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
        _ws_send_error_safe(
            connection, msg["id"], ex, handler="ws_add_contact"
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/remove_contact",
        vol.Required("public_key"): str,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.require_admin
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
        _ws_send_error_safe(
            connection, msg["id"], ex, handler="ws_remove_contact"
        )


# ─── meshcore/trace ─────────────────────────────────────────────────
# Discovery-mode traces delegate to the upstream meshcore.trace service
# (PR #216, meshcore>=2.6.0). Explicit-path traces (when 'path' is
# provided) keep the original inlined SDK plumbing because the upstream
# service does not currently accept an explicit-path argument — see
# Session 53 / Session 55 Addendum 2 in the meshcore-ha workspace log
# for the production case the explicit-path branch protects.


def _trace_error_for(
    upstream_code: str, result: dict | None, msg: dict
) -> tuple[str, str]:
    """Translate an upstream meshcore.trace error envelope into the
    pre-migration ``(chat_code, message)`` pair the frontend has always
    seen.

    Plumbs through the upstream service's optional ``reason`` field so
    failures keep their diagnostic detail.
    """
    pubkey = msg.get("pubkey_prefix", "")
    reason = (result or {}).get("reason")

    if upstream_code == "no_coordinator":
        return "not_found", "No active MeshCore coordinator"
    if upstream_code == "not_connected":
        return "not_connected", "Device not connected"
    if upstream_code == "contact_not_found":
        return (
            "not_in_mesh",
            f"No mesh record for {pubkey} — the device must have seen "
            "this node's advertisement at least once to trace it.",
        )
    if upstream_code == "contact_not_on_device":
        return (
            "contact_not_on_device",
            "This contact isn't on your device yet — the device can only "
            "trace contacts it's stored. Add the contact to the device "
            "first, then try trace again.",
        )
    if upstream_code == "contact_missing_pubkey":
        return "error", "Contact has no public key; cannot construct trace target hash."
    if upstream_code == "path_discovery_failed":
        # Service may include reason="no_firmware_ack" for the no-ack
        # case; the malformed-PATH_RESPONSE case uses no reason.
        if reason == "no_firmware_ack":
            return (
                "path_discovery_failed",
                "Device did not acknowledge the path-discovery request.",
            )
        return (
            "path_discovery_failed",
            "Path discovery response was malformed (missing out_path_len).",
        )
    if upstream_code == "path_discovery_rejected":
        return (
            "path_discovery_rejected",
            f"Node rejected path-discovery request: {reason or 'unknown'}",
        )
    if upstream_code == "path_discovery_timeout":
        # Upstream service does not return the timeout duration used,
        # so the message drops the "within Xs" suffix the pre-migration
        # version included.
        return (
            "path_discovery_timeout",
            "No PATH_RESPONSE — the contact did not reply. Try again later.",
        )
    if upstream_code == "send_failed":
        return "send_failed", f"Device rejected trace: {reason or 'unknown'}"
    if upstream_code == "timeout":
        return "timeout", "Trace timed out — no response received"
    if upstream_code in ("await_failed", "internal_error"):
        return "error", f"Internal error during trace: {upstream_code}"
    # Unknown upstream code — likely a firmware-supplied passthrough
    # string (per PR #217 docs). Surface it raw so users can report it.
    return "error", str(upstream_code)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/trace",
        vol.Required("pubkey_prefix"): str,
        vol.Optional("entry_id"): str,
        # Optional comma-separated hex hops, e.g. "86,AE".  When provided,
        # backend skips path discovery and calls send_trace() with this
        # path directly.  Absent/empty → upstream meshcore.trace service.
        vol.Optional("path"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_trace(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Run a trace against a contact and measure round-trip time.

    Discovery-mode traces (default) delegate to the upstream
    ``meshcore.trace`` service (PR #216, requires meshcore>=2.6.0). The
    upstream service was lifted from this exact code in PR #216, so
    behavior is identical: round-trip 1-byte-hash path construction
    (Mesh.cpp:41-66), pre-registered PATH_RESPONSE listener, 15 s
    flood-discovery floor, ``added_to_node`` gate, etc.

    Explicit-path traces (``msg["path"]`` supplied) bypass the service
    and call ``mesh_core.commands.send_trace`` directly, preserving the
    Session 53 / Session 55 Addendum 2 workaround for production cases
    where flood path discovery doesn't return a PATH_RESPONSE.

    The frontend's ``TraceResult`` shape (``frontend/src/api.ts:355``)
    is preserved unchanged across both branches — no frontend changes.
    """
    if msg.get("path"):
        await _ws_trace_explicit(hass, connection, msg)
        return

    if not hass.services.has_service(MESHCORE_DOMAIN, "trace"):
        connection.send_error(
            msg["id"],
            "service_unavailable",
            "Upstream meshcore.trace service not registered — "
            "requires meshcore>=2.6.0. Update the meshcore integration.",
        )
        return

    service_data: dict = {"pubkey_prefix": msg["pubkey_prefix"]}
    if msg.get("entry_id"):
        service_data["entry_id"] = msg["entry_id"]

    try:
        result = await hass.services.async_call(
            MESHCORE_DOMAIN,
            "trace",
            service_data,
            blocking=True,
            return_response=True,
        )
    except Exception as ex:
        _ws_send_error_safe(
            connection, msg["id"], ex, handler="ws_trace"
        )
        return

    trace = (result or {}).get("trace")
    if trace is None:
        # Service returned a structured error. Map back to the chat's
        # pre-migration error codes + message text so frontend toasts
        # read identically to today.
        upstream_code = (result or {}).get("error", "error")
        chat_code, message = _trace_error_for(upstream_code, result, msg)
        connection.send_error(msg["id"], chat_code, message)
        return

    # Reshape into the existing TraceResult shape (TS interface in
    # frontend/src/api.ts:355). Service returns hops/path/round_trip_ms/
    # final_snr/tag at trace.* — the WS contract is the same fields at
    # top level plus a formatted response_time string.
    rtt = int(trace.get("round_trip_ms", 0))
    connection.send_result(msg["id"], {
        "round_trip_ms": rtt,
        "response_time": f"{rtt}ms",
        "hops": trace.get("hops", 0),
        "final_snr": trace.get("final_snr"),
        "path": trace.get("path", []),
    })


async def _ws_trace_explicit(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Inlined explicit-path trace handler.

    When the user supplies an explicit comma-hex hop sequence via the
    ``path`` parameter, bypass ``meshcore.trace`` and call
    ``mesh_core.commands.send_trace`` directly. The upstream service
    (PR #216) does not accept an explicit-path argument; if it gains
    one, this branch can collapse into the service call and the
    SDK-level coupling here disappears.

    Why this branch exists: Session 53 (2026-04-20) DEBUG capture
    showed multi-hop flood path discovery does not reliably return a
    PATH_RESPONSE for all reachable targets (e.g. Otay RPTR via
    ca.cv.main-st: firmware accepts + broadcasts the request, but no
    response ever arrives). The native MeshCoreOne iOS app works
    around this by letting the user type the hop sequence manually;
    this branch mirrors that workaround.
    """
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
    explicit_path = msg["path"]  # caller (ws_trace) guaranteed non-empty

    contact = coordinator.get_contact_by_prefix(pubkey_prefix)
    if not contact:
        connection.send_error(
            msg["id"],
            "not_in_mesh",
            f"No mesh record for {pubkey_prefix} — the device must have seen "
            "this node's advertisement at least once to trace it.",
        )
        return
    if not contact.get("added_to_node"):
        connection.send_error(
            msg["id"],
            "contact_not_on_device",
            "This contact isn't on your device yet — the device can only "
            "trace contacts it's stored. Add the contact to the device "
            "first, then try trace again.",
        )
        return

    try:
        tag = random.randint(0, 0xFFFFFFFF)

        # Pass the user's comma-hex string through unchanged — send_trace()
        # parses it internally and its debug log shows the exact input
        # verbatim, which aids diagnosis if a typo slips through.
        # Session 55 Addendum 2: pass flags=None so the SDK derives flags
        # from the user's per-hop hex width
        # (meshcore_py/messaging.py:249-268).
        trace_path_arg = explicit_path
        flags = None
        out_path_len = len([h for h in explicit_path.split(",") if h.strip()])
        _LOGGER.debug(
            "ws_trace: explicit path for %s: %s (%d hops)",
            pubkey_prefix, explicit_path, out_path_len,
        )

        start_time = time.monotonic()

        # TRACE_DATA correlation via the catch-all raw-event bus —
        # forward_all_events() in __init__.py re-fires every SDK event
        # as meshcore_raw_event with {event_type, payload, timestamp}.
        response_future: asyncio.Future = hass.loop.create_future()

        def _on_raw_event(event):
            data = event.data or {}
            if "TRACE_DATA" not in (data.get("event_type", "") or ""):
                return
            payload = data.get("payload") or {}
            if payload.get("tag") == tag and not response_future.done():
                response_future.set_result(payload)

        unsub = hass.bus.async_listen(f"{MESHCORE_DOMAIN}_raw_event", _on_raw_event)

        try:
            from meshcore.events import EventType as _EventType
            send_result = await api.mesh_core.commands.send_trace(
                0, tag, flags, trace_path_arg
            )
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

            # Bound the TRACE_DATA wait using the device's suggested
            # timeout * 1.2, with sensible floor/ceiling.
            timeout_ms = (api.self_info or {}).get("suggested_timeout", 15000)
            timeout_s = min(max(timeout_ms / 1000.0 * 1.2, 5.0), 60.0)

            try:
                response_data = await asyncio.wait_for(response_future, timeout=timeout_s)
                round_trip_ms = int((time.monotonic() - start_time) * 1000)

                # Path is only populated when path_len > 0. The final
                # entry in path[] is the local device's SNR on receiving
                # the trace echo; earlier entries carry per-hop SNRs.
                path = response_data.get("path") or []
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
                connection.send_error(
                    msg["id"], "timeout",
                    "Trace timed out — no response received",
                )
        finally:
            unsub()

    except Exception as ex:
        _ws_send_error_safe(
            connection, msg["id"], ex, handler="ws_trace_explicit"
        )


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
@websocket_api.require_admin
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
    hass.data[DOMAIN]), not the upstream coordinator.

    The inbound ``entry_id`` field is intentionally NOT forwarded to
    ``_get_store`` — it stays on the schema for backwards compatibility
    but the handler always uses the ``None``-fallback branch. Same
    reason as ``ws_mark_read`` / ``ws_get_messages_around``: the chat
    panel's frontend forwards ``this.config?.entry_id`` to every WS
    handler, and that resolves to the parent ``meshcore`` integration's
    entry id rather than the chat companion's. The chat companion is
    single-instance per its config flow, so the fallback resolves
    deterministically.
    """
    # Always use the fallback — see the docstring for the rationale.
    store = _get_store(hass, None)
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

    The inbound ``entry_id`` field is intentionally NOT forwarded to
    ``_get_store`` — it stays on the schema for backwards compatibility
    but the handler always uses the ``None``-fallback branch. Same
    reason as ``ws_mark_read`` / ``ws_get_messages_around``: the chat
    panel's frontend forwards the parent ``meshcore`` integration's
    entry id, not the chat companion's. The chat companion is single-
    instance per its config flow, so the fallback resolves
    deterministically.
    """
    # Always use the fallback — see the docstring for the rationale.
    store = _get_store(hass, None)
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

    The inbound ``entry_id`` field is intentionally NOT forwarded to
    ``_get_store`` — it stays on the schema for backwards compatibility
    but the handler always uses the ``None``-fallback branch. Same
    reason as ``ws_mark_read`` / ``ws_get_messages_around``: the chat
    panel's frontend forwards the parent ``meshcore`` integration's
    entry id, not the chat companion's. The chat companion is single-
    instance per its config flow, so the fallback resolves
    deterministically.
    """
    # Always use the fallback — see the docstring for the rationale.
    store = _get_store(hass, None)
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): "meshcore_chat/get_messages_around",
        vol.Required("entity_id"): str,
        vol.Required("anchor_id"): str,
        vol.Optional("before_limit", default=25): int,
        vol.Optional("after_limit", default=50): int,
        vol.Optional("entry_id"): str,
    }
)
@websocket_api.async_response
async def ws_get_messages_around(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Return a window of messages anchored on a message id.

    The panel calls this once per conversation open with the cursor that
    ``ws_mark_read`` snapshotted, and gets back ``before_limit`` messages
    older than the anchor + ``after_limit`` messages newer than the
    anchor in a single round-trip. The anchor itself is included in the
    window; ``anchor_index`` tells the frontend where to put the unread
    divider.

    Wire shape: ``{messages, anchor_index, has_more_before,
    has_more_after, anchor_found}``. ``anchor_found`` is ``False`` when
    the anchor id is no longer present in the conversation (pruning,
    manual storage deletion, or future archive feature could orphan the
    cursor); the panel falls back to a
    no-divider view that matches a fresh-install open.

    The inbound ``entry_id`` field is intentionally NOT forwarded to
    ``_get_store`` — it stays on the schema for backwards compatibility
    but the handler always uses the ``None``-fallback branch. Same
    reason as ``ws_mark_read``: the chat panel's frontend forwards
    ``this.config?.entry_id`` to every WS handler, and that resolves to
    the parent ``meshcore`` integration's entry id rather than the chat
    companion's. The chat companion is single-instance per its config
    flow, so the fallback resolves deterministically.
    """
    # Always use the fallback — see the docstring for the rationale.
    store = _get_store(hass, None)
    if store is None:
        connection.send_error(
            msg["id"], "not_found", "No MeshCore Chat message store found"
        )
        return

    (
        window,
        anchor_index,
        has_more_before,
        has_more_after,
        anchor_found,
    ) = await store.get_messages_around(
        msg["entity_id"],
        msg["anchor_id"],
        before_limit=msg.get("before_limit", 25),
        after_limit=msg.get("after_limit", 50),
    )
    connection.send_result(
        msg["id"],
        {
            "messages": window,
            "anchor_index": anchor_index,
            "has_more_before": has_more_before,
            "has_more_after": has_more_after,
            "anchor_found": anchor_found,
        },
    )
