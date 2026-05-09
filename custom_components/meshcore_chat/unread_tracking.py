"""Unread message tracking for MeshCore Chat.

Originally lifted verbatim (logic-wise) from upstream `feature/sidebar-
panel: unread_tracking.py`. The bus event name is kept on the upstream
`meshcore_*` namespace so the panel can subscribe to the same event
whether it's running against the upstream integration or the companion.
The tracker instance itself lives in the companion's domain bucket:
``hass.data["meshcore_chat"]["unread_tracker"]``.

Phase 1 (proposal `Last-Read Anchor and Read-Receipt Refinement for
Chat Panel`) layered a persistent ``_last_read: dict[entity_id ->
message_id]`` map on top of the in-memory unread counts. Persistence
uses HA's ``Store`` helper via the ``meshcore_chat.last_read.<entry_id>``
key, with a 2-second debounced save that coalesces rapid cursor
advances.

Phase 1 of proposal `Cursor-Derived Unread Count and Mark-Read Gate
Fix` (2026-05-08) removed the in-memory ``_unread`` counter entirely.
Unread counts are now derived on demand from the persistent cursor +
the chronologically-sorted ``MessageStore`` (see
``MessageStore.count_unread_after``). This eliminates the desync class
where the in-memory counter reset on HA restart while the persistent
cursor survived — making the badge undercount on `#test`-style
channels by the number of inbound messages received between the most
recent ``mark_read`` and the most recent reset. The tracker now owns
exactly one piece of state: the persistent cursor map. ``clear()`` is
a no-op kept for callsite compatibility (cursors are intentionally
preserved across config-entry reloads — locked decision 2026-05-04).
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

# Debounce window for the persisted save. Coalesces rapid cursor
# advances (e.g. user scrolling through a fast-moving channel) into a
# single disk write. Worst-case loss on HA shutdown is bounded by this
# value; ``async_unload_entry`` calls ``_flush()`` to drain the pending
# write (R6 mitigation in the Phase 1 proposal).
LAST_READ_SAVE_DEBOUNCE_MS = 2000


class UnreadTracker:
    """Track the persistent last-read cursor per conversation entity.

    One persistent map keyed on the HA entity_id:

    * ``_last_read`` — persistent via HA's ``Store`` helper. The newest
      message id at the moment of the user's last ``mark_read``. The
      durable record of what the user has actually seen, used by
      ``get_messages_around`` to anchor the viewport on conversation
      open and by ``MessageStore.count_unread_after`` to derive the
      unread badge count on demand (Phase 1 of proposal `Cursor-
      Derived Unread Count and Mark-Read Gate Fix`).

    Unread *counts* used to live here as an in-memory ``_unread`` dict;
    that field was removed in 2026-05-08 because in-memory state could
    not survive an HA restart while the cursor did, producing a
    persistent badge undercount on busy channels. Counts are now
    derived from the cursor + store; the tracker is purely a cursor
    persister.
    """

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        """Initialize the tracker.

        ``entry_id`` is the chat companion's config-entry id; it
        parametrises the per-HA-instance storage key so schemas don't
        collide if the singleton pattern is ever relaxed.
        """
        self.hass = hass
        self.entry_id = entry_id
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

    async def mark_read(
        self, entity_id: str, message_id: str | None
    ) -> None:
        """Advance the read cursor and notify subscribers.

        Called from ``ws_mark_read``. ``message_id`` is the newest
        stored message id at this moment (or ``None`` if the
        conversation has no stored messages, in which case the cursor
        is left untouched — same defensive no-op as the prior
        implementation). Schedules a debounced disk save and fires
        ``EVENT_UNREAD_UPDATED`` with ``unread_count=0`` so the panel
        immediately reflects the cleared badge without waiting for the
        next ``ws_get_unread_counts`` round-trip.

        Phase 1 of proposal `Cursor-Derived Unread Count and Mark-Read
        Gate Fix` (2026-05-08): this method replaces the previous
        ``mark_read(entity_id)`` + ``set_last_read(entity_id, msg_id)``
        pair. The cursor advance and the event fire are now
        unconditional (apart from the no-message no-op) — there is no
        in-memory counter to gate the event on.
        """
        if message_id is not None:
            self._last_read[entity_id] = message_id
            self._schedule_save()
        self.hass.bus.async_fire(
            EVENT_UNREAD_UPDATED,
            {"entity_id": entity_id, "unread_count": 0},
        )

    def get_last_read(self, entity_id: str) -> str | None:
        """Return the persisted cursor for ``entity_id``, or None.

        ``None`` covers fresh installs and conversations the user has
        never marked read; callers fall back to the legacy
        newest-N-messages load path.
        """
        return self._last_read.get(entity_id)

    def get_all_last_read(self) -> dict[str, str]:
        """Return a defensive copy of the cursor map.

        Used by ``ws_get_unread_counts`` to send the full map to the
        panel on connect — single round-trip on panel load. A copy, not
        the live dict, so callers can iterate without worrying about
        concurrent ``mark_read`` mutating mid-iteration.
        """
        return dict(self._last_read)

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
        """No-op (kept for callsite compatibility).

        Pre-2026-05-08 this cleared the in-memory ``_unread`` counter.
        That counter is gone — unread counts are now derived from the
        persistent cursor + the message store, so there is no transient
        in-memory state to reset on config-entry unload. ``_last_read``
        is intentionally NOT cleared (locked decision 2026-05-04,
        Change 1 in the original Phase 1 proposal): a config-entry
        reload should not wipe the user's read positions. Cursors
        survive across reload cycles via ``async_load`` rehydrating
        from disk.

        Kept as a method (rather than removed) because
        ``async_unload_entry`` calls it on last-entry unload; preserving
        the no-op shape avoids an AttributeError on existing call sites.
        """
