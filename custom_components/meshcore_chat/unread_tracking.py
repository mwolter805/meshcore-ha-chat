"""Unread message tracking for MeshCore Chat.

Lifted verbatim (logic-wise) from upstream `feature/sidebar-panel:
unread_tracking.py`. Counts and bus event names are kept on the
upstream `meshcore_*` namespace for the bus event so the panel can
subscribe to the same event whether it's running against the upstream
integration or the companion. The tracker instance itself lives in
the companion's domain bucket: `hass.data["meshcore_chat"]["unread_tracker"]`.

Phase 1 (proposal `Last-Read Anchor and Read-Receipt Refinement for
Chat Panel`) layered a persistent ``_last_read: dict[entity_id ->
message_id]`` map on top of the in-memory unread counts. The unread
*count* remains in-memory-only (derived display state); the cursor is
the durable state. Persistence uses HA's ``Store`` helper via the
``meshcore_chat.last_read.<entry_id>`` key, with a 2-second debounced
save that coalesces rapid ``mark_read`` calls. ``clear()`` resets
counts only — cursors survive integration unload/reload (locked
decision 2026-05-04, Change 1: a config-entry reload should not wipe
read positions, since reloads happen for routine reasons).
"""
from __future__ import annotations

import asyncio
import logging

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

_LOGGER = logging.getLogger(__name__)

# Bus event fired whenever a conversation's unread count changes. Kept on
# the `meshcore_*` namespace so existing frontend listeners written for
# upstream's sidebar-panel work unchanged.
EVENT_UNREAD_UPDATED = "meshcore_unread_updated"

# Storage key for the persistent last-read cursor map. ``{entry_id}`` is
# the chat companion's config-entry id; the singleton pattern in
# ``__init__.py`` means there's typically one of these per HA process,
# but the key parametrisation lets the schema scale if multi-entry is
# ever introduced.
STORAGE_VERSION = 1
STORAGE_KEY_LAST_READ = "meshcore_chat.last_read.{entry_id}"

# Debounce window for the persisted save. Coalesces rapid ``set_last_read``
# calls (e.g. user scrolling through a fast-moving channel) into a single
# disk write. Worst-case loss on HA shutdown is bounded by this value;
# ``async_unload_entry`` calls ``_flush()`` to drain the pending write
# (R6 mitigation in the Phase 1 proposal).
LAST_READ_SAVE_DEBOUNCE_MS = 2000


class UnreadTracker:
    """Track unread message counts and last-read cursor per conversation entity.

    Two parallel maps keyed on the HA entity_id:

    * ``_unread`` — in-memory, transient. The display count; resets to 0
      on ``mark_read`` and to the empty dict on ``clear()`` /
      HA-restart. Bus events fire on every mutation so the panel can
      live-update its badge.
    * ``_last_read`` — persistent via HA's ``Store`` helper. The newest
      message id at the moment of the user's last ``mark_read``. This is
      the durable record of what the user has actually seen, used by
      Phase 2's ``get_messages_around`` endpoint to anchor the viewport
      on conversation open.
    """

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        """Initialize the tracker.

        ``entry_id`` is the chat companion's config-entry id; it
        parametrises the per-HA-instance storage key so schemas don't
        collide if the singleton pattern is ever relaxed.
        """
        self.hass = hass
        self.entry_id = entry_id
        self._unread: dict[str, int] = {}
        self._last_read: dict[str, str] = {}
        self._store: Store[dict[str, str]] = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY_LAST_READ.format(entry_id=entry_id),
        )
        self._save_timer: asyncio.TimerHandle | None = None

    async def async_load(self) -> None:
        """Hydrate ``_last_read`` from disk.

        Called once during ``async_setup_entry``. Returns the empty dict
        for fresh installs (``Store.async_load()`` returns None for
        missing storage files — covers R5).
        """
        stored = await self._store.async_load()
        # Defensive: legacy or partial files might not be a dict; the
        # Store helper does no type validation. Coerce to {} on any
        # unexpected shape rather than poisoning later lookups.
        if isinstance(stored, dict):
            # Only keep string→string entries — defensive in case a future
            # schema bump ever adds nested values.
            self._last_read = {
                k: v for k, v in stored.items()
                if isinstance(k, str) and isinstance(v, str)
            }
        else:
            self._last_read = {}

    async def mark_unread(self, entity_id: str) -> None:
        """Increment unread count for an entity."""
        self._unread[entity_id] = self._unread.get(entity_id, 0) + 1
        self.hass.bus.async_fire(
            EVENT_UNREAD_UPDATED,
            {"entity_id": entity_id, "unread_count": self._unread[entity_id]},
        )

    async def mark_read(self, entity_id: str) -> None:
        """Clear unread count for an entity.

        The cursor (``_last_read``) is not snapshotted here — that
        happens in ``ws_mark_read`` (Change 3) where the WS handler has
        access to the message store and can query the newest message id.
        Keeping the cursor snapshot in the WS handler avoids coupling
        ``UnreadTracker`` to ``MessageStore``.
        """
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

    def get_last_read(self, entity_id: str) -> str | None:
        """Return the persisted cursor for ``entity_id``, or None.

        ``None`` covers fresh installs and conversations the user has
        never marked read; callers fall back to the legacy
        newest-N-messages load path.
        """
        return self._last_read.get(entity_id)

    def get_all_last_read(self) -> dict[str, str]:
        """Return a defensive copy of the cursor map.

        Used by ``ws_get_unread_counts`` (Change 4) to send the full map
        to the panel on connect — single round-trip on panel load. A
        copy, not the live dict, so callers can iterate without worrying
        about concurrent ``set_last_read`` mutating mid-iteration.
        """
        return dict(self._last_read)

    async def set_last_read(self, entity_id: str, message_id: str) -> None:
        """Record a new cursor for ``entity_id`` and schedule a debounced save.

        Idempotent: writing the same ``(entity_id, message_id)`` pair
        twice is fine. Multiple rapid calls coalesce into a single disk
        write after the ``LAST_READ_SAVE_DEBOUNCE_MS`` window.
        """
        self._last_read[entity_id] = message_id
        self._schedule_save()

    def _schedule_save(self) -> None:
        """Schedule a debounced save, replacing any pending timer."""
        if self._save_timer is not None:
            self._save_timer.cancel()
        self._save_timer = self.hass.loop.call_later(
            LAST_READ_SAVE_DEBOUNCE_MS / 1000,
            lambda: self.hass.async_create_task(self._flush()),
        )

    async def _flush(self) -> None:
        """Cancel any pending debounce and persist ``_last_read`` to disk.

        Safe to call multiple times. Called on debounce-fire (the timer
        callback creates the task) and from ``async_unload_entry`` to
        drain the pending write before HA shuts down (R6 mitigation).
        """
        if self._save_timer is not None:
            self._save_timer.cancel()
            self._save_timer = None
        await self._store.async_save(self._last_read)

    def clear(self) -> None:
        """Clear in-memory unread counts only.

        Called from ``async_unload_entry`` on last-entry unload so a
        subsequent re-add of the integration does not inherit stale
        counts. The tracker instance itself is preserved (its closures
        may be referenced by live WS handlers and the bus subscription
        registered at first setup) — only the in-memory counts reset.

        ``_last_read`` is intentionally NOT cleared (locked decision
        2026-05-04, Change 1 in the Phase 1 proposal): a config-entry
        reload should not wipe the user's read positions. Cursors
        survive across reload cycles via ``async_load`` rehydrating
        from disk.
        """
        self._unread.clear()
