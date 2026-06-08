"""Per-channel region-scope persistence for MeshCore Chat.

MeshCore channels live on the companion radio as (index, name, key)
slots — the device-side channel record has no field for a region scope,
and the upstream meshcore integration treats scope as a per-send
argument (the optional ``scope`` on ``meshcore.send_channel_message``,
added by meshcore-dev/meshcore-ha#250) rather than channel state. The
chat panel's per-channel scope selector therefore needs its own durable
home: this module persists the user's chosen scope per
(upstream config entry, channel index) pair via HA's ``Store`` helper.

Writes happen only when the user saves or removes a channel in the
panel, so saves are immediate (no debounce). The singleton instance
lives in the companion's domain bucket:
``hass.data["meshcore_chat"]["channel_scopes"]``.
"""
from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1

# One process-wide file; entries are keyed inside the payload by the
# upstream meshcore config-entry id, then by channel index, so a single
# store serves every upstream coordinator on multi-entry setups.
STORAGE_KEY_CHANNEL_SCOPES = "meshcore_chat.channel_scopes"


class ChannelScopeStore:
    """Persist per-channel region scopes.

    Payload shape::

        {
            "<upstream_entry_id>": {
                "<channel_idx>": "<scope name>",
                ...
            },
            ...
        }

    Channel indices are stored as strings (JSON object keys). A channel
    with no scope simply has no entry — empty-string scopes are never
    stored.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store against HA's .storage directory."""
        self._store: Store[dict[str, dict[str, str]]] = Store(
            hass, STORAGE_VERSION, STORAGE_KEY_CHANNEL_SCOPES
        )
        self._scopes: dict[str, dict[str, str]] = {}

    async def async_load(self) -> None:
        """Hydrate the in-memory map from disk (once, at setup)."""
        data = await self._store.async_load()
        if isinstance(data, dict):
            self._scopes = data
            _LOGGER.debug(
                "Loaded channel scopes for %d upstream entr%s",
                len(data),
                "y" if len(data) == 1 else "ies",
            )

    def get(self, entry_id: str, channel_idx: int) -> str | None:
        """Return the persisted scope for a channel, or None when unscoped."""
        return self._scopes.get(entry_id, {}).get(str(channel_idx))

    async def async_set(
        self, entry_id: str, channel_idx: int, scope: str | None
    ) -> None:
        """Set or clear a channel's scope and persist immediately.

        Passing ``None`` or an empty/whitespace-only string clears the
        record (the channel reverts to unscoped global flood).
        """
        scope = (scope or "").strip()
        idx_key = str(channel_idx)
        per_entry = self._scopes.setdefault(entry_id, {})

        if scope:
            if per_entry.get(idx_key) == scope:
                return  # no change — skip the disk write
            per_entry[idx_key] = scope
        else:
            if idx_key not in per_entry:
                if not per_entry:
                    self._scopes.pop(entry_id, None)
                return  # nothing to clear
            del per_entry[idx_key]
            if not per_entry:
                del self._scopes[entry_id]

        await self._store.async_save(self._scopes)
