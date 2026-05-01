"""Diagnostics support for MeshCore Chat.

Provides a redacted snapshot of integration state via Settings → Devices
& Services → ⋮ → Download diagnostics. The snapshot includes:

- Companion entry shape (redacted entry_id, title, options).
- Detected upstream meshcore service surface (which services HA has
  registered right now — informs degraded-behavior diagnosis).
- Per-entry message-index summary (conversation count, total message
  count, per-conversation last_message_ts).
- Process-global UnreadTracker state (entity_id → count, redacted to
  stable hash prefixes).
- Upstream meshcore coordinator presence (count, connected flags, name,
  max_channels — no config secrets).
- Process-global flag state (panel registration, WS registration, etc.).

Pubkey prefixes (12-hex) are NOT redacted — they are not secrets; they
are network-public identifiers visible to every node in radio range.
Conversation entity_ids ARE redacted to a stable 8-char SHA-256 prefix
to protect peer privacy when diagnostic dumps are shared in support
requests.
"""
from __future__ import annotations

import hashlib
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import MeshCoreChatRuntimeData
from .const import DOMAIN, MESHCORE_DOMAIN


def _redact_entity_id(entity_id: str) -> str:
    """Return a stable hash of an entity_id for diagnostic anonymisation.

    The hash is deterministic across diagnostic dumps so support requests
    referencing "<entity-abc12345>" can be cross-correlated, but the
    original entity_id (and therefore the peer name embedded in it) is
    not recoverable from the dump.
    """
    return f"<entity-{hashlib.sha256(entity_id.encode()).hexdigest()[:8]}>"


def _redact_entry_id(entry_id: str) -> str:
    """Return a redacted entry_id that preserves first 8 chars for cross-ref."""
    return f"<entry-{entry_id[:8]}>"


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostic data for a meshcore_chat config entry."""
    runtime = (
        entry.runtime_data
        if isinstance(entry.runtime_data, MeshCoreChatRuntimeData)
        else None
    )

    # Service surface detection — what's actually registered right now.
    # Tells us whether the user is on meshcore >= 2.6.0 (full surface) or
    # an older release (degraded path).
    service_surface = {
        svc: hass.services.has_service(MESHCORE_DOMAIN, svc)
        for svc in (
            "get_contacts",
            "get_channels",
            "trace",
            "send_message",
            "send_channel_message",
        )
    }

    # Per-conversation index summary, redacted entity_ids.
    if runtime is not None:
        index = runtime.store.get_message_index()
        index_summary = {
            _redact_entity_id(eid): {
                "message_count": v.get("message_count", 0),
                "last_message_ts": v.get("last_message_ts", ""),
            }
            for eid, v in index.items()
        }
        index_total = sum(v.get("message_count", 0) for v in index.values())
    else:
        index_summary = {}
        index_total = 0

    # Upstream coordinator presence (count + connected flags only — no
    # config secrets, no device IDs).
    coordinators = []
    for upstream_entry_id, coord in (hass.data.get(MESHCORE_DOMAIN) or {}).items():
        if hasattr(coord, "api"):
            coordinators.append(
                {
                    "entry_id_redacted": _redact_entry_id(upstream_entry_id),
                    "connected": getattr(coord.api, "connected", False),
                    "name": getattr(coord, "name", "unknown"),
                    "max_channels": getattr(coord, "max_channels", 0),
                }
            )

    # Unread tracker state (process-global singleton). Keyed by hashed
    # entity_id; raw counts pass through.
    bucket = hass.data.get(DOMAIN, {}) or {}
    tracker = bucket.get("unread_tracker")
    unread_summary: dict[str, int] = {}
    if tracker is not None:
        for eid, count in tracker.get_all_unread().items():
            unread_summary[_redact_entity_id(eid)] = count

    return {
        "entry": {
            "entry_id_redacted": _redact_entry_id(entry.entry_id),
            "title": entry.title,
            "options": dict(entry.options),
        },
        "service_surface": service_surface,
        "message_store": {
            "indexed_conversations": len(index_summary),
            "total_messages": index_total,
            "summary": index_summary,
        },
        "upstream": {
            "domain": MESHCORE_DOMAIN,
            "coordinators": coordinators,
        },
        "unread_tracker": unread_summary,
        "process_globals": {
            "panel_registered": bool(bucket.get("_panel_registered")),
            "ws_registered": bool(bucket.get("_ws_registered")),
            "service_surface_logged": bool(bucket.get("_service_surface_logged")),
        },
    }
