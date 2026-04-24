"""Utility helpers for the MeshCore Chat companion integration.

Lifted minimally from upstream `feature/sidebar-panel:utils.py` — only the
two helpers `ws_api.py` references at module load. The companion's helper
intentionally references MESHCORE_DOMAIN (the upstream meshcore domain)
when building entity_ids, because the entities being addressed live under
the upstream integration's namespace, not the companion's.

If the companion grows to need more of the upstream `utils.py` surface
(e.g. `parse_rx_log_data`, `decrypt_channel_message`), copy them here
with a similar minimal-import treatment rather than adding a hard import
on the upstream module.
"""
from __future__ import annotations

import logging

from homeassistant.util import slugify

from .const import MESHCORE_DOMAIN

_LOGGER = logging.getLogger(__name__)


def sanitize_name(name: str) -> str:
    """Convert a name to a format safe for entity IDs.

    Mirrors upstream `meshcore.utils.sanitize_name` exactly so entity_ids
    constructed here match what the upstream integration registered.
    """
    return slugify(name.lower() if name else "")


def format_entity_id(
    domain: str, device_name: str, entity_key: str, suffix: str = ""
) -> str:
    """Format a consistent entity ID.

    The first name part is the *upstream* MeshCore domain ("meshcore"), not
    the companion's DOMAIN ("meshcore_chat"). The entity being identified
    was registered by the upstream integration, so its entity_id begins
    with `<entity_domain>.meshcore_<device>_<key>...`. Using the companion
    DOMAIN here would produce IDs that don't match anything in the
    registry.

    Args:
        domain: Entity domain (e.g. 'binary_sensor', 'sensor').
        device_name: Device name fragment (already sanitized by caller).
        entity_key: Entity-specific identifier.
        suffix: Optional suffix.

    Returns:
        Formatted entity ID like `binary_sensor.meshcore_<device>_<key>_<suffix>`.
    """
    if not domain or not entity_key:
        _LOGGER.warning("Missing required parameters for entity ID formatting")
        return ""

    # Build the entity name parts (everything after the entity domain).
    # Filter out empty strings to prevent double underscores.
    name_parts = [
        part for part in [MESHCORE_DOMAIN, device_name, entity_key, suffix] if part
    ]
    entity_name = "_".join(name_parts).replace("__", "_")
    return f"{domain}.{sanitize_name(entity_name)}"


def enrich_rx_log_entries(rx_log_data):
    """Backfill ``path_nodes`` and ``hop_count`` on rx_log entries.

    The companion-supporting ``dev/combined`` upstream branch builds
    rx_log_entry dicts with ``path`` (hex string) and ``path_len`` (int)
    but omits the two convenience fields that ``feature/sidebar-panel``
    adds (``path_nodes`` — the per-node split — and ``hop_count`` — an
    alias for ``path_len``). The companion frontend's bubble code reads
    ``path_nodes`` and ``hop_count``; without enrichment it falls
    through to the "0 hops" fallback even when a real path exists.

    Mirror sidebar-panel's logic here so the stored record matches the
    schema the frontend expects. Default ``hash_size = 1`` (2 hex chars
    per node) — matches what upstream `parse_rx_log_data` produces and
    what was emitted on sidebar-panel.

    Mutates entries in place. Returns the list (or whatever was passed).
    Returns True if any entry was modified — callers can use this to
    decide whether to mark backing storage dirty.
    """
    if not rx_log_data:
        return False
    changed = False
    for entry in rx_log_data:
        if not isinstance(entry, dict):
            continue
        if "path_nodes" not in entry and entry.get("path"):
            raw = entry["path"]
            hs = entry.get("hash_size", 1)
            n = max(hs * 2, 2)
            entry["path_nodes"] = [raw[i:i + n] for i in range(0, len(raw), n)]
            changed = True
        if "hop_count" not in entry and "path_len" in entry:
            entry["hop_count"] = entry["path_len"]
            changed = True
    return changed
