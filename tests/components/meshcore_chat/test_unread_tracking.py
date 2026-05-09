"""Unit tests for ``custom_components.meshcore_chat.unread_tracking``.

Originally Phase 1 of `Last-Read Anchor and Read-Receipt Refinement
for Chat Panel`. Updated 2026-05-08 for Phase 1 of `Cursor-Derived
Unread Count and Mark-Read Gate Fix`, which removed the in-memory
``_unread`` counter and folded ``set_last_read`` into ``mark_read``.

Coverage:

1. ``async_load`` rehydrates the cursor map across tracker instances
   sharing the same Store key.
2. ``mark_read(entity_id, message_id)`` advances the cursor and fires
   ``EVENT_UNREAD_UPDATED`` with ``unread_count=0``; multiple rapid
   calls coalesce into a single debounced disk write.
3. ``mark_read(entity_id, None)`` does NOT advance the cursor but
   still fires the cleared-badge event (defensive no-op for empty
   conversations).
4. ``clear()`` is a no-op that preserves the persistent cursor
   (locked decision 2026-05-04: a config-entry reload should not wipe
   the user's read positions).
5. ``_flush()`` drains any pending debounced write, used by
   ``async_unload_entry`` to cover R6 (HA shutdown mid-debounce).

PHACC's ``hass_storage`` fixture intercepts ``Store`` reads/writes so
no temporary directory is needed; ``hass_storage[KEY]["data"]`` is the
on-disk-equivalent payload assertion target.
"""
from __future__ import annotations

import pytest
from homeassistant.core import HomeAssistant

from custom_components.meshcore_chat.unread_tracking import (
    EVENT_UNREAD_UPDATED,
    LAST_READ_SAVE_DEBOUNCE_MS,
    STORAGE_KEY_LAST_READ,
    UnreadTracker,
)

ENTRY_ID = "01TEST_ENTRY"
STORAGE_KEY = STORAGE_KEY_LAST_READ.format(entry_id=ENTRY_ID)


# ─── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
async def tracker(hass: HomeAssistant):
    """A loaded UnreadTracker bound to ENTRY_ID's storage key."""
    t = UnreadTracker(hass, ENTRY_ID)
    await t.async_load()
    yield t
    # Drain any pending debounce so the test doesn't leave a TimerHandle
    # behind for PHACC to complain about.
    await t._flush()


def _capture_unread_events(hass: HomeAssistant) -> list[dict]:
    """Subscribe to ``EVENT_UNREAD_UPDATED`` and capture every payload."""
    events: list[dict] = []
    hass.bus.async_listen(EVENT_UNREAD_UPDATED, lambda e: events.append(dict(e.data)))
    return events


# ─── async_load / mark_read persistence ────────────────────────────────


async def test_last_read_persistence(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    """Set, flush, then reload from a fresh tracker — value preserved.

    Verifies the round-trip Store.async_save → Store.async_load path
    that backs the persistence guarantee. A second tracker bound to
    the same entry_id sees what the first one wrote.
    """
    t1 = UnreadTracker(hass, ENTRY_ID)
    await t1.async_load()
    await t1.mark_read("binary_sensor.alice", "msg_42")
    await t1._flush()

    # Storage assertion — the wire shape is the bare dict (no extra
    # nesting beyond Store's standard {version, key, data} envelope).
    assert hass_storage[STORAGE_KEY]["data"] == {
        "binary_sensor.alice": "msg_42"
    }

    # Fresh tracker reading the same key sees the persisted entry.
    t2 = UnreadTracker(hass, ENTRY_ID)
    await t2.async_load()
    assert t2.get_last_read("binary_sensor.alice") == "msg_42"
    assert t2.get_last_read("binary_sensor.bob") is None
    assert t2.get_all_last_read() == {"binary_sensor.alice": "msg_42"}


# ─── debounced save ────────────────────────────────────────────────────


async def test_mark_read_debounced_save(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    """Multiple rapid mark_read calls coalesce into one disk write.

    Three back-to-back calls schedule and re-schedule the same timer.
    Until the debounce window elapses the storage file does not exist.
    After ``_flush()`` (or the timer firing), the file holds the LAST
    value written for each key.
    """
    t = UnreadTracker(hass, ENTRY_ID)
    await t.async_load()

    await t.mark_read("binary_sensor.alice", "msg_1")
    await t.mark_read("binary_sensor.alice", "msg_2")
    await t.mark_read("binary_sensor.alice", "msg_3")

    # Pre-debounce: nothing on disk yet (the timer is scheduled but not
    # fired). PHACC's hass_storage dict is the disk equivalent.
    assert STORAGE_KEY not in hass_storage

    # Force the flush (mirrors what the timer callback would do).
    await t._flush()

    assert hass_storage[STORAGE_KEY]["data"] == {
        "binary_sensor.alice": "msg_3"
    }
    # Sanity: the timer has been cancelled and cleared by _flush.
    assert t._save_timer is None


# ─── mark_read fires EVENT_UNREAD_UPDATED with count=0 ─────────────────


async def test_mark_read_fires_unread_event(
    hass: HomeAssistant, tracker: UnreadTracker
) -> None:
    """Every ``mark_read`` call fires ``EVENT_UNREAD_UPDATED`` with count=0.

    The panel listens on this event to clear the badge immediately
    rather than waiting for the next ``ws_get_unread_counts`` round-
    trip. Phase 1 of `Cursor-Derived Unread Count and Mark-Read Gate
    Fix` removed the prior pre-check on the in-memory counter — the
    event now fires on every call (the count is always 0 by
    derivation, since the cursor just advanced to the latest message).
    """
    events = _capture_unread_events(hass)

    await tracker.mark_read("binary_sensor.alice", "msg_42")
    await hass.async_block_till_done()

    assert events == [
        {"entity_id": "binary_sensor.alice", "unread_count": 0},
    ]


async def test_mark_read_with_none_message_does_not_advance_cursor(
    hass: HomeAssistant, tracker: UnreadTracker, hass_storage: dict
) -> None:
    """``mark_read(entity_id, None)`` is a defensive no-op on the cursor.

    Used by ``ws_mark_read`` when the conversation has no stored
    messages yet (``store.get_messages(entity_id, limit=1)`` returns
    []). The cursor is left untouched so we don't fabricate a None
    cursor that would break the divider's anchor lookup, but the
    event still fires so any pre-set badge clears.
    """
    events = _capture_unread_events(hass)

    # Seed a cursor; verify it survives the no-op.
    await tracker.mark_read("binary_sensor.alice", "msg_seed")
    await tracker._flush()
    assert tracker.get_last_read("binary_sensor.alice") == "msg_seed"

    # Now call with None — cursor must not change.
    await tracker.mark_read("binary_sensor.alice", None)
    await hass.async_block_till_done()

    assert tracker.get_last_read("binary_sensor.alice") == "msg_seed"
    # Both calls fired the event; the second one too (it's the panel's
    # signal that the badge has been cleared).
    assert len(events) == 2
    assert all(e["unread_count"] == 0 for e in events)


# ─── clear() is a no-op (Change 1 locked decision) ─────────────────────


async def test_clear_preserves_last_read(tracker: UnreadTracker) -> None:
    """``clear()`` preserves cursors.

    Locked 2026-05-04 per Change 1: a config-entry reload (which calls
    clear() via async_unload_entry's last-entry branch) must not wipe
    the user's read positions. Phase 1 of `Cursor-Derived Unread
    Count and Mark-Read Gate Fix` removed the in-memory ``_unread``
    counter, so ``clear()`` is now a structural no-op kept only for
    callsite compatibility.
    """
    await tracker.mark_read("binary_sensor.alice", "msg_42")
    await tracker.mark_read("binary_sensor.bob", "msg_99")

    assert tracker.get_last_read("binary_sensor.alice") == "msg_42"

    tracker.clear()

    # Cursors preserved.
    assert tracker.get_last_read("binary_sensor.alice") == "msg_42"
    assert tracker.get_last_read("binary_sensor.bob") == "msg_99"
    assert tracker.get_all_last_read() == {
        "binary_sensor.alice": "msg_42",
        "binary_sensor.bob": "msg_99",
    }


# ─── _flush drains pending writes (R6 mitigation) ──────────────────────


async def test_async_unload_flushes(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    """Mid-debounce ``_flush()`` writes the latest cursor to disk.

    Simulates the ``async_unload_entry`` path: a ``mark_read``
    schedules a 2 s debounce, HA begins shutting down before the timer
    fires, and the unload path calls ``_flush()`` to drain. Without
    this, R6 (HA shutdown loses the snapshot) would bite.
    """
    t = UnreadTracker(hass, ENTRY_ID)
    await t.async_load()

    await t.mark_read("binary_sensor.alice", "msg_42")
    # Sanity: the timer is scheduled but the file isn't there yet.
    assert t._save_timer is not None
    assert STORAGE_KEY not in hass_storage

    # Unload-equivalent: drain the pending write.
    await t._flush()

    assert hass_storage[STORAGE_KEY]["data"] == {
        "binary_sensor.alice": "msg_42"
    }
    assert t._save_timer is None

    # Idempotent: a second flush with no pending state is a no-op write
    # of the same map (acceptable — Store.async_save is cheap and the
    # contents don't change).
    await t._flush()
    assert hass_storage[STORAGE_KEY]["data"] == {
        "binary_sensor.alice": "msg_42"
    }


# ─── Defensive coverage on async_load ──────────────────────────────────


async def test_async_load_handles_missing_store(hass: HomeAssistant) -> None:
    """Fresh installs (no stored file) yield an empty ``_last_read``.

    Covers R5 — Store.async_load returns None for missing data. The
    tracker must initialise to ``{}`` rather than carrying None
    through the lookup paths.
    """
    t = UnreadTracker(hass, ENTRY_ID)
    await t.async_load()
    assert t.get_all_last_read() == {}
    assert t.get_last_read("anything") is None


async def test_debounce_constant_matches_expected(hass: HomeAssistant) -> None:
    """Pin the debounce constant at 2000 ms (proposal locked value).

    Guards against an accidental tuning that would silently change the
    R6 worst-case loss window.
    """
    assert LAST_READ_SAVE_DEBOUNCE_MS == 2000
