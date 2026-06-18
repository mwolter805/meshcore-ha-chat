"""Utility helpers for the MeshCore Chat companion integration.

Lifted minimally from the upstream meshcore integration's `utils.py` — only
the two helpers `ws_api.py` references at module load. The companion's helper
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

    The upstream coordinator this companion consumes builds
    rx_log_entry dicts with ``path`` (hex string) and ``path_len`` (int)
    but omits two convenience fields the frontend relies on
    (``path_nodes`` — the per-node split — and ``hop_count`` — an
    alias for ``path_len``). The companion frontend's bubble code reads
    ``path_nodes`` and ``hop_count``; without enrichment it falls
    through to the "0 hops" fallback even when a real path exists.

    Derive those fields here so the stored record matches the
    schema the frontend expects. Per-hop width is taken from the
    propagated protocol field ``path_hash_size`` when present; otherwise
    it is derived from ``len(path) / path_len`` (a flood path is
    uniform-width per packet), falling back to 1 byte (2 hex chars) per
    node only when neither source is usable.

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
            # Per-hop width in hex chars. A flood path is uniform-width
            # per packet (originator-stamped), so
            # one width describes the whole path. Prefer the protocol
            # field path_hash_size (propagated from meshcore-ha). If
            # absent (entries fired before that fix, or any path lacking
            # it), derive it: path_len is the hop count and len(raw)//2
            # the byte count, so bytes-per-hop is their ratio. Fall back
            # to 1 byte/hop only when neither source is usable.
            hs = entry.get("path_hash_size")
            if hs:
                n = max(hs * 2, 2)
            else:
                path_len = entry.get("path_len") or entry.get("hop_count")
                byte_len = len(raw) // 2
                if path_len and byte_len % path_len == 0:
                    n = (byte_len // path_len) * 2
                else:
                    n = 2
            entry["path_nodes"] = [raw[i:i + n] for i in range(0, len(raw), n)]
            changed = True
        if "hop_count" not in entry and "path_len" in entry:
            entry["hop_count"] = entry["path_len"]
            changed = True
    return changed


def derive_flood_scope(rx_log_data) -> tuple[str | None, bool | None]:
    """Derive one ``(flood_scope, region_scope)`` for a message from its
    per-repeater rx_log entries.

    The upstream meshcore integration stamps each rx_log entry of a
    received channel message with ``flood_scope`` ("*" for a global flood
    when the user allowlisted "*", a region name for a transport-scoped
    flood, else None) and ``region_scope`` (True when the flood carried a
    transport region code). All per-repeater entries of one received
    message describe the same packet, so they share one scope — this
    returns the first entry's values. Returns ``(None, None)`` when no
    entry carries the fields: DMs, synthesized route entries, or messages
    received before the integration stamped scope.
    """
    if not rx_log_data:
        return None, None
    flood_scope: str | None = None
    region_scope: bool | None = None
    for entry in rx_log_data:
        if not isinstance(entry, dict):
            continue
        if flood_scope is None and entry.get("flood_scope") is not None:
            flood_scope = entry["flood_scope"]
        if region_scope is None and entry.get("region_scope") is not None:
            region_scope = entry["region_scope"]
    return flood_scope, region_scope


def hoist_flood_scope(message: dict) -> bool:
    """Hoist ``flood_scope``/``region_scope`` from a message's rx_log_data
    to top-level record fields the frontend reads.

    Channel-message scope is delivered per-repeater inside ``rx_log_data``,
    which is frequently correlated and patched in *after* the bubble first
    renders. Hoisting one value to the top of the record (the same place
    ``repeater_count`` is kept correct) lets the panel show the scope
    without re-deriving from the per-repeater array. No-op when the message
    carries no rx_log scope (the fields stay absent). Mutates ``message``
    in place; returns True if anything changed.
    """
    flood_scope, region_scope = derive_flood_scope(message.get("rx_log_data"))
    changed = False
    if flood_scope is not None and message.get("flood_scope") != flood_scope:
        message["flood_scope"] = flood_scope
        changed = True
    if region_scope is not None and message.get("region_scope") != region_scope:
        message["region_scope"] = region_scope
        changed = True
    return changed
