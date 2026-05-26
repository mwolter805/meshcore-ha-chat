"""Per-conversation persistent message store for MeshCore Chat.

Lifted from the upstream `meshcore` coordinator and decoupled — this
class owns its own state and storage, and has no
reference to a coordinator. The companion integration owns one instance
per config entry and stores it under
``hass.data["meshcore_chat"][entry_id]["store"]``.

Adaptations from the upstream version:

1. No coordinator coupling — `_loaded_conversations` and friends are
   instance attributes here, not borrowed from a coordinator.
2. Storage key prefix is ``meshcore_chat.*`` instead of ``meshcore.*``
   (avoids file collisions if a similar feature ever lands in core).
3. Tunables (max-per-conversation, retention days) are read from
   ``ConfigEntry.options`` with constants from ``const.py`` as defaults.
4. The store is agnostic about message *contents* — it accepts whatever
   dict the listeners produce. Missing fields like ``hop_count`` and
   ``snr`` (currently absent on incoming-DM events upstream) are simply
   not present in the stored record. No code change
   needed when those fields start arriving.
"""
from __future__ import annotations

import asyncio
import bisect
import logging
import time
from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
    DEFAULT_MESSAGE_RETENTION_DAYS,
    MESSAGE_STORE_IDLE_EVICTION_SECONDS,
    MESSAGE_STORE_SAVE_DELAY_SECONDS,
    OPT_MAX_MESSAGES_PER_CONVERSATION,
    OPT_MESSAGE_RETENTION_DAYS,
    STORAGE_KEY_CONVERSATION,
    STORAGE_KEY_INDEX,
    STORAGE_VERSION,
)
from .utils import enrich_rx_log_entries

_LOGGER = logging.getLogger(__name__)


def _safe_id(entity_id: str) -> str:
    """Convert an entity_id to a filename-safe component."""
    return entity_id.replace(".", "_")


def _backfill_messages(messages: list[dict]) -> bool:
    """One-time, in-place migration of stored records.

    Three backfills:

    1. Enrich rx_log entries with ``path_nodes``/``hop_count`` derived
       from ``path``/``path_len``. The upstream coordinator this companion
       consumes emits the raw fields but not the convenience aliases the
       frontend reads — so existing records show "0 hops" until enriched.

    2. Promote stuck outgoing messages from ``delivery_status="pending"``
       to ``"sent"`` when there's clear evidence the message hit the air
       (``repeater_count > 0`` or non-empty ``rx_log_data``). Pre-fix
       outgoing records all defaulted to "pending" and never advanced
       because progressive delivery_update events also defaulted to
       "pending". This unsticks them on next load.

    3. Synth a single-entry ``rx_log_data`` for DMs that carry top-level
       ``hop_count`` but no ``rx_log_data``. The frontend route popup keys
       off ``rx_log_data``; without this, DMs (which never get RX_LOG
       correlation) wouldn't show route metadata. Mirrors the live-message
       synth in ``__init__.py`` so existing stored DMs benefit too.

    Returns True if anything changed — caller should mark the
    conversation dirty so the migration persists on next save.
    """
    changed = False
    for m in messages:
        if not isinstance(m, dict):
            continue
        rx = m.get("rx_log_data")
        if rx and enrich_rx_log_entries(rx):
            changed = True
        if (
            m.get("outgoing")
            and m.get("delivery_status") == "pending"
            and (m.get("repeater_count") or rx)
        ):
            m["delivery_status"] = "sent"
            changed = True
        # Synth rx_log_data for DMs with top-level hop_count and no rx_log.
        # Skip None values for snr/rssi — frontend would render "RSSI: null"
        # otherwise.
        if m.get("hop_count") is not None and not m.get("rx_log_data"):
            synth: dict = {"hop_count": m["hop_count"], "synthesized": True}
            if m.get("snr") is not None:
                synth["snr"] = m["snr"]
            if m.get("rssi") is not None:
                synth["rssi"] = m["rssi"]
            m["rx_log_data"] = [synth]
            changed = True
    return changed


class MessageStore:
    """Per-conversation persistent message storage with lazy loading and idle eviction.

    Owns:
      - A lightweight always-in-memory index (one entry per conversation:
        message_count, last_message_ts, last_sender, last_preview).
      - A pool of per-conversation Store handles (created lazily).
      - An LRU-like cache of fully loaded conversations (evicted after 5 min idle).
      - Debounced save timers per conversation and one for the index.
    """

    def __init__(self, hass: HomeAssistant, config_entry: ConfigEntry) -> None:
        """Initialize the message store. Call ``async_load_index`` before use."""
        self.hass = hass
        self.config_entry = config_entry

        # Lightweight index — always in memory after async_load_index.
        self._message_index_store: Store[dict] = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY_INDEX.format(entry_id=config_entry.entry_id),
        )
        self._message_index: dict[str, dict] = {}

        # Per-conversation data — loaded on demand, evicted when idle.
        self._loaded_conversations: dict[str, list[dict]] = {}
        self._conversation_stores: dict[str, Store] = {}
        self._conversation_dirty: set[str] = set()
        self._conversation_last_access: dict[str, float] = {}

        # Timers for debounced saves and idle eviction.
        self._msg_save_timers: dict[str, asyncio.TimerHandle | None] = {}
        self._index_save_timer: asyncio.TimerHandle | None = None
        self._eviction_timer: asyncio.TimerHandle | None = None

    # ── lifecycle ──────────────────────────────────────────────────────────

    async def async_load_index(self) -> None:
        """Load the lightweight message index at integration startup.

        Called once from async_setup_entry. Loads only the index
        (~100 bytes per conversation), not any conversation message data.
        """
        stored = await self._message_index_store.async_load()
        self._message_index = stored or {}
        _LOGGER.debug(
            "MessageStore index loaded: %d conversations tracked",
            len(self._message_index),
        )

    async def async_unload(self) -> None:
        """Flush all dirty data and cancel timers. Call from async_unload_entry."""
        await self.flush()

    # ── store handle ───────────────────────────────────────────────────────

    def _store_for(self, entity_id: str) -> Store:
        """Lazily create the per-conversation Store handle."""
        store = self._conversation_stores.get(entity_id)
        if store is None:
            store = Store(
                self.hass,
                STORAGE_VERSION,
                STORAGE_KEY_CONVERSATION.format(
                    entry_id=self.config_entry.entry_id,
                    safe_entity_id=_safe_id(entity_id),
                ),
            )
            self._conversation_stores[entity_id] = store
        return store

    async def _ensure_loaded(self, entity_id: str) -> list[dict]:
        """Load a conversation's messages into memory if not already cached."""
        if entity_id in self._loaded_conversations:
            self._conversation_last_access[entity_id] = time.time()
            return self._loaded_conversations[entity_id]

        stored = await self._store_for(entity_id).async_load()
        messages: list[dict] = stored or []
        # One-time backfill on first load — enriches old records that pre-date
        # the rx_log/delivery-status fixes. Persists on next save.
        if messages and _backfill_messages(messages):
            _LOGGER.debug(
                "Backfilled rx_log/delivery_status on stored records for %s",
                entity_id,
            )
            self._conversation_dirty.add(entity_id)
            self._schedule_conversation_save(entity_id)
        self._loaded_conversations[entity_id] = messages
        self._conversation_last_access[entity_id] = time.time()
        self._schedule_eviction()
        return messages

    async def _load_for_search(self, entity_id: str) -> list[dict]:
        """Load a conversation for read-only search without caching.

        If the conversation is already cached (user has it open) this
        returns the cached copy. Otherwise it loads from disk and returns
        a transient copy that is NOT stored in ``_loaded_conversations`` —
        preventing search from inflating memory with idle conversations.
        """
        if entity_id in self._loaded_conversations:
            return self._loaded_conversations[entity_id]
        stored = await self._store_for(entity_id).async_load()
        return stored or []

    # ── public API: writes ─────────────────────────────────────────────────

    async def store_message(self, entity_id: str, message: dict) -> None:
        """Store a message record for a conversation.

        ``message`` is the dict shape produced by event listeners — the
        store does not validate or normalize fields. Missing fields
        (e.g. ``hop_count``, ``snr`` until PR-A lands) are simply absent.
        """
        messages = await self._ensure_loaded(entity_id)

        # Dedup by ID (check recent messages only).
        # After the chronological-insert change below, ``messages[-50:]`` is
        # the newest 50 by timestamp (was: the 50 most-recently-inserted).
        # Improvement: dedup intent was always chronological — a delayed
        # mesh event re-arriving after a more recent event no longer slips
        # past the window simply because it landed at the tail.
        msg_id = message.get("id", "")
        if msg_id and any(m.get("id") == msg_id for m in messages[-50:]):
            return

        # Bisect-insert by timestamp keeps the list chronological even when
        # a delayed mesh event arrives after a more recent message has
        # already been stored. Cost: O(log n) lookup + O(n) shift; n is
        # bounded by ``max_per_conv`` (default 1000), so total cost is
        # sub-millisecond. The ``last_read`` cursor logic and
        # ``get_messages(limit=N)`` semantics depend on ``messages[-1]``
        # being the chronologically newest message, not the most-recently
        # inserted one.
        bisect.insort(
            messages, message, key=lambda m: m.get("timestamp", "")
        )

        # Enforce per-conversation limit (FIFO trim).
        # ``messages[-max:]`` now keeps the chronologically newest N — the
        # correct behaviour, and an upgrade from the prior insertion-order
        # semantics that could have evicted a recently-arrived but
        # older-by-timestamp message.
        max_per_conv = self.config_entry.options.get(
            OPT_MAX_MESSAGES_PER_CONVERSATION,
            DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
        )
        if len(messages) > max_per_conv:
            messages[:] = messages[-max_per_conv:]

        self._conversation_dirty.add(entity_id)
        self._schedule_conversation_save(entity_id)

        # Update lightweight index. ``messages[-1]`` is now guaranteed to
        # be the chronologically newest message in the buffer, which is
        # what the index is intended to surface.
        newest = messages[-1]
        self._message_index[entity_id] = {
            "message_count": len(messages),
            "last_message_ts": newest.get("timestamp", ""),
            "last_sender": newest.get("sender", ""),
            "last_preview": (newest.get("text", "") or "")[:50],
        }
        self._schedule_index_save()

    async def update_message_rx_data(
        self, entity_id: str, message_id: str, rx_log_data: list
    ) -> None:
        """Update rx_log_data on an existing stored message."""
        messages = await self._ensure_loaded(entity_id)
        for m in reversed(messages):  # search newest first
            if m.get("id") == message_id:
                m["rx_log_data"] = rx_log_data
                m["repeater_count"] = len(rx_log_data)
                self._conversation_dirty.add(entity_id)
                self._schedule_conversation_save(entity_id)
                return

    async def update_message_delivery(
        self, entity_id: str, message_id: str, status: str, **kwargs: Any
    ) -> None:
        """Update delivery status (and optional extra fields) on a stored message."""
        messages = await self._ensure_loaded(entity_id)
        for m in reversed(messages):
            if m.get("id") == message_id:
                m["delivery_status"] = status
                m.update(kwargs)
                self._conversation_dirty.add(entity_id)
                self._schedule_conversation_save(entity_id)
                return

    async def update_message_delivery_any(
        self, message_id: str, status: str, **kwargs: Any
    ) -> str | None:
        """Update delivery status on a message whose entity_id we don't know.

        Pre-PR-B, ``meshcore_delivery_update`` events may not carry an
        ``entity_id``. Scan all known conversations to locate the message
        by id. Returns the entity_id of the conversation we updated, or
        None if no match was found.

        For correctness over speed: walks every conversation in the index
        (using the non-caching ``_load_for_search`` path so we don't hold
        idle conversations in memory). Once located, performs the actual
        update through the cached path so the in-memory copy and the
        eviction timer stay coherent.
        """
        for entity_id in list(self._message_index.keys()):
            messages = await self._load_for_search(entity_id)
            if any(m.get("id") == message_id for m in messages):
                await self.update_message_delivery(
                    entity_id, message_id, status, **kwargs
                )
                return entity_id
        return None

    # ── public API: reads ──────────────────────────────────────────────────

    async def get_messages(
        self,
        entity_id: str,
        limit: int = 50,
        before: str | None = None,
        after: str | None = None,
    ) -> list[dict]:
        """Get messages for a conversation with cursor pagination.

        Args:
            before: Return messages older than this message ID (lazy-load scrollback).
            after: Return messages newer than this message ID (incremental poll).
        """
        messages = await self._ensure_loaded(entity_id)
        if before:
            idx = next(
                (i for i, m in enumerate(messages) if m.get("id") == before),
                len(messages),
            )
            messages = messages[:idx]
        if after:
            idx = next(
                (i for i, m in enumerate(messages) if m.get("id") == after),
                -1,
            )
            if idx >= 0:
                messages = messages[idx + 1:]
            # For 'after' queries return oldest-first (up to limit).
            return messages[:limit]
        return messages[-limit:]

    async def get_messages_around(
        self,
        entity_id: str,
        anchor_id: str,
        before_limit: int = 25,
        after_limit: int = 50,
    ) -> tuple[list[dict], int, bool, bool, bool]:
        """Return a window of messages anchored on ``anchor_id``.

        Used by the panel on conversation open to load a narrow band
        around the persisted
        last-read cursor in a single round-trip — typically 25 older +
        50 newer messages — instead of paging up from the newest 50 to
        find the unread divider.

        The window is computed against the chronologically-sorted store
        list (ordering is kept reliable via ``bisect.insort``).
        Slice semantics:

        - ``start = max(0, anchor_idx - before_limit + 1)`` — anchor
          itself counts as one of the "before" messages so the panel
          can keep the anchor visible at the bottom of the read history.
        - ``end = min(len(all), anchor_idx + after_limit + 1)`` — first
          ``after_limit`` messages strictly newer than the anchor.
        - ``has_more_before`` / ``has_more_after`` — flags telling the
          frontend whether to enable the lazy-load triggers in either
          direction.

        Anchor-not-found path: pruning, manual
        deletion of ``.storage/meshcore_chat.<entity>.json``, or a future
        archive feature could orphan the cursor. We fall back to the
        newest ``(before_limit + after_limit)`` messages with
        ``anchor_found = False`` so the frontend can render a no-divider
        view that's identical to a fresh-install open. The total fallback
        size matches the regular window's max length (75 by default), so
        the panel never has to special-case the wire shape.

        Returns:
            ``(window, anchor_index_in_window, has_more_before,
            has_more_after, anchor_found)``. ``anchor_index_in_window``
            is the position of ``anchor_id`` inside ``window``; on the
            anchor-not-found path it's ``len(window)`` so the divider
            renders at the end of the buffer (which is also the bottom).
        """
        all_msgs = await self._ensure_loaded(entity_id)
        anchor_idx = next(
            (i for i, m in enumerate(all_msgs) if m.get("id") == anchor_id),
            None,
        )
        if anchor_idx is None:
            tail = all_msgs[-(before_limit + after_limit):]
            return (
                tail,
                len(tail),
                len(all_msgs) > len(tail),
                False,
                False,
            )

        start = max(0, anchor_idx - before_limit + 1)
        end = min(len(all_msgs), anchor_idx + after_limit + 1)
        window = all_msgs[start:end]
        return (
            window,
            anchor_idx - start,
            start > 0,
            end < len(all_msgs),
            True,
        )

    async def count_unread_after(
        self, entity_id: str, cursor_id: str | None
    ) -> int:
        """Count inbound messages chronologically newer than ``cursor_id``.

        Used by the cursor-derived unread-badge path. Replaces
        the in-memory ``UnreadTracker._unread`` counter — derives the
        unread count on demand from the persistent cursor + the
        chronologically-sorted store, eliminating the desync class
        where the in-memory counter reset on HA restart while the
        persistent cursor survived.

        ``cursor_id=None`` (fresh-install or never-read conversation)
        returns the count of all inbound messages — which on a fresh
        install is the same as the legacy in-memory counter would have
        produced (zero, since no messages have been stored yet).

        Cursor-not-found path (pruning, manual storage deletion, archive
        feature): returns the count of all inbound messages, matching
        the divider's "no anchor → fall back to count-based" branch in
        ``_renderItemsWithDivider``. Both surfaces stay consistent.

        Outgoing messages do not count — same semantics as the legacy
        ``_unread`` counter, which only incremented on
        ``not record["outgoing"]`` in the message handler.
        """
        messages = await self._ensure_loaded(entity_id)
        if cursor_id is None:
            return sum(1 for m in messages if not m.get("outgoing", False))
        idx = next(
            (i for i, m in enumerate(messages) if m.get("id") == cursor_id),
            None,
        )
        if idx is None:
            # Cursor pruned/orphaned — same fallback as the divider's
            # anchor-not-found path.
            return sum(1 for m in messages if not m.get("outgoing", False))
        return sum(
            1 for m in messages[idx + 1:] if not m.get("outgoing", False)
        )

    def get_message_index(self) -> dict[str, dict]:
        """Return the lightweight message index (always in memory)."""
        return self._message_index

    async def search(
        self,
        query: str,
        entity_id: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search stored messages by text or sender name.

        Uses ``_load_for_search`` so conversations loaded solely for search
        are not retained in memory after the call returns.

        ``conversation_name`` is left for the WS handler to resolve from
        HA entity state — the store deliberately doesn't depend on
        ``hass.states`` for free-form name lookups.
        """
        query_lc = query.lower()
        results: list[dict] = []

        entities = (
            [entity_id] if entity_id else list(self._message_index.keys())
        )
        for eid in entities:
            messages = await self._load_for_search(eid)
            for m in reversed(messages):
                ts = m.get("timestamp", "")
                if from_date and ts < from_date:
                    continue
                if to_date and ts > to_date:
                    continue
                if query_lc in (m.get("text", "") or "").lower() or query_lc in (
                    m.get("sender", "") or ""
                ).lower():
                    results.append({**m, "entity_id": eid})
                    if len(results) >= limit:
                        return results
        return results

    # ── save scheduling (debounced) ────────────────────────────────────────

    def _schedule_conversation_save(self, entity_id: str) -> None:
        """Debounce per-conversation store writes."""
        existing = self._msg_save_timers.get(entity_id)
        if existing is not None:
            existing.cancel()
        self._msg_save_timers[entity_id] = self.hass.loop.call_later(
            MESSAGE_STORE_SAVE_DELAY_SECONDS,
            lambda eid=entity_id: self.hass.async_create_task(
                self._save_conversation(eid)
            ),
        )

    async def _save_conversation(self, entity_id: str) -> None:
        """Save a single conversation to disk."""
        self._msg_save_timers.pop(entity_id, None)
        if entity_id not in self._loaded_conversations:
            return
        store = self._conversation_stores.get(entity_id)
        if store is None:
            return
        try:
            await store.async_save(self._loaded_conversations[entity_id])
            self._conversation_dirty.discard(entity_id)
        except Exception as ex:  # pragma: no cover - defensive
            _LOGGER.error("Error saving conversation %s: %s", entity_id, ex)

    def _schedule_index_save(self) -> None:
        """Debounce index store writes."""
        if self._index_save_timer is not None:
            self._index_save_timer.cancel()
        self._index_save_timer = self.hass.loop.call_later(
            MESSAGE_STORE_SAVE_DELAY_SECONDS,
            lambda: self.hass.async_create_task(self._save_index()),
        )

    async def _save_index(self) -> None:
        """Save the message index to disk."""
        self._index_save_timer = None
        try:
            await self._message_index_store.async_save(self._message_index)
        except Exception as ex:  # pragma: no cover - defensive
            _LOGGER.error("Error saving message index: %s", ex)

    # ── idle eviction ──────────────────────────────────────────────────────

    def _schedule_eviction(self) -> None:
        """Schedule idle conversation eviction check."""
        if self._eviction_timer is not None:
            self._eviction_timer.cancel()
        self._eviction_timer = self.hass.loop.call_later(
            MESSAGE_STORE_IDLE_EVICTION_SECONDS,
            lambda: self.hass.async_create_task(self._evict_idle()),
        )

    async def _evict_idle(self) -> None:
        """Save and unload conversations not accessed in the eviction window."""
        self._eviction_timer = None
        cutoff = time.time() - MESSAGE_STORE_IDLE_EVICTION_SECONDS
        evicted: list[str] = []
        for entity_id in list(self._loaded_conversations):
            if self._conversation_last_access.get(entity_id, 0) < cutoff:
                if entity_id in self._conversation_dirty:
                    await self._save_conversation(entity_id)
                del self._loaded_conversations[entity_id]
                self._conversation_last_access.pop(entity_id, None)
                evicted.append(entity_id)

        if evicted:
            _LOGGER.debug(
                "Evicted %d idle conversation(s) from memory", len(evicted)
            )

        if self._loaded_conversations:
            self._schedule_eviction()

    # ── flush / cleanup ────────────────────────────────────────────────────

    async def flush(self) -> None:
        """Save all dirty conversations and the index to disk.

        Called at integration unload to ensure no data is lost.
        """
        # Cancel pending timers.
        for timer in self._msg_save_timers.values():
            if timer is not None:
                timer.cancel()
        self._msg_save_timers.clear()
        if self._index_save_timer is not None:
            self._index_save_timer.cancel()
            self._index_save_timer = None
        if self._eviction_timer is not None:
            self._eviction_timer.cancel()
            self._eviction_timer = None

        # Save all dirty conversations.
        for entity_id in list(self._conversation_dirty):
            if entity_id in self._loaded_conversations:
                store = self._conversation_stores.get(entity_id)
                if store is not None:
                    try:
                        await store.async_save(
                            self._loaded_conversations[entity_id]
                        )
                    except Exception as ex:  # pragma: no cover - defensive
                        _LOGGER.error(
                            "Error flushing conversation %s: %s", entity_id, ex
                        )
        self._conversation_dirty.clear()

        # Save index.
        try:
            await self._message_index_store.async_save(self._message_index)
        except Exception as ex:  # pragma: no cover - defensive
            _LOGGER.error("Error flushing message index: %s", ex)

    async def cleanup_old_messages(self) -> None:
        """Remove messages older than the retention window.

        Called at integration startup; safe to schedule daily. Uses
        transient loading to avoid caching all conversations in memory.
        """
        retention_days = self.config_entry.options.get(
            OPT_MESSAGE_RETENTION_DAYS, DEFAULT_MESSAGE_RETENTION_DAYS
        )
        cutoff = datetime.now() - timedelta(days=retention_days)
        cutoff_iso = cutoff.isoformat()
        total_pruned = 0

        for entity_id in list(self._message_index.keys()):
            # If already cached (user has conversation open), prune in-place.
            if entity_id in self._loaded_conversations:
                messages = self._loaded_conversations[entity_id]
                original_count = len(messages)
                messages[:] = [
                    m for m in messages if m.get("timestamp", "") > cutoff_iso
                ]
                trimmed = original_count - len(messages)
                if trimmed > 0:
                    total_pruned += trimmed
                    self._conversation_dirty.add(entity_id)
                    if messages:
                        self._message_index[entity_id]["message_count"] = len(messages)
                    else:
                        del self._message_index[entity_id]
                continue

            # Not cached — load transiently, prune, save, discard.
            store = self._store_for(entity_id)
            stored = await store.async_load()
            messages = stored or []
            original_count = len(messages)
            messages = [
                m for m in messages if m.get("timestamp", "") > cutoff_iso
            ]
            trimmed = original_count - len(messages)

            if trimmed > 0:
                total_pruned += trimmed
                await store.async_save(messages)
                if messages:
                    self._message_index[entity_id]["message_count"] = len(messages)
                else:
                    del self._message_index[entity_id]

        if total_pruned > 0:
            _LOGGER.info(
                "Message retention cleanup: pruned %d messages older than %d days",
                total_pruned,
                retention_days,
            )
