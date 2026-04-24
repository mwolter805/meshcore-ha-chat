"""Unread message tracking for MeshCore Chat.

Lifted verbatim (logic-wise) from upstream `feature/sidebar-panel:
unread_tracking.py`. Counts and bus event names are kept on the
upstream `meshcore_*` namespace for the bus event so the panel can
subscribe to the same event whether it's running against the upstream
integration or the companion. The tracker instance itself lives in
the companion's domain bucket: `hass.data["meshcore_chat"]["unread_tracker"]`.
"""
from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

# Bus event fired whenever a conversation's unread count changes. Kept on
# the `meshcore_*` namespace so existing frontend listeners written for
# upstream's sidebar-panel work unchanged.
EVENT_UNREAD_UPDATED = "meshcore_unread_updated"


class UnreadTracker:
    """Track unread message counts per conversation entity."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the tracker."""
        self.hass = hass
        self._unread: dict[str, int] = {}

    async def mark_unread(self, entity_id: str) -> None:
        """Increment unread count for an entity."""
        self._unread[entity_id] = self._unread.get(entity_id, 0) + 1
        self.hass.bus.async_fire(
            EVENT_UNREAD_UPDATED,
            {"entity_id": entity_id, "unread_count": self._unread[entity_id]},
        )

    async def mark_read(self, entity_id: str) -> None:
        """Clear unread count for an entity."""
        if entity_id in self._unread:
            self._unread[entity_id] = 0
            self.hass.bus.async_fire(
                EVENT_UNREAD_UPDATED,
                {"entity_id": entity_id, "unread_count": 0},
            )

    def get_unread(self, entity_id: str) -> int:
        """Get unread count for an entity."""
        return self._unread.get(entity_id, 0)

    def get_all_unread(self) -> dict[str, int]:
        """Get all unread counts."""
        return {k: v for k, v in self._unread.items() if v > 0}
