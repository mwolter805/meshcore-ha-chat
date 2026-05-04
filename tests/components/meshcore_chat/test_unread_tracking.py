"""Unit tests for ``custom_components.meshcore_chat.unread_tracking``.

Phase 1 of the `Last-Read Anchor and Read-Receipt Refinement for
Chat Panel` proposal. Covers the new persistent ``_last_read`` map
layered on top of the in-memory unread counts:

1. ``async_load`` rehydrates the cursor map across tracker instances
   sharing the same Store key.
2. ``set_last_read`` debounces the disk write — multiple rapid calls
   coalesce into a single ``Store.async_save`` after the
   ``LAST_READ_SAVE_DEBOUNCE_MS`` window.
3. ``clear()`` resets unread counts but preserves cursors (locked
   decision 2026-05-04, Change 1: a config-entry reload should not
   wipe the user's read positions).
4. ``_flush()`` drains any pending debounced write, used by
   ``async_unload_entry`` to cover R6 (HA shutdown mid-debounce).

PHACC's ``hass_storage`` fixture intercepts ``Store`` reads/writes so
no temporary directory is needed; ``hass_storage[KEY]["data"]`` is the
on-disk-equivalent payload assertion target.
"""
from __future__ import annotations

import asyncio

import pytest
from homeassistant.core import HomeAssistant

from custom_components.meshcore_chat.unread_tracking import (
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


# ─── async_load / set_last_read persistence ────────────────────────────


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
    await t1.set_last_read("binary_sensor.alice", "msg_42")
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


async def test_set_last_read_debounced_save(
    hass: HomeAssistant, hass_storage: dict
) -> None:
    """Multiple rapid set_last_read calls coalesce into one disk write.

    Three back-to-back calls schedule and re-schedule the same timer.
    Until the debounce window elapses the storage file does not exist.
    After ``_flush()`` (or the timer firing), the file holds the LAST
    value written for each key.
    """
    t = UnreadTracker(hass, ENTRY_ID)
    await t.async_load()

    await t.set_last_read("binary_sensor.alice", "msg_1")
    await t.set_last_read("binary_sensor.alice", "msg_2")
    await t.set_last_read("binary_sensor.alice", "msg_3")

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


# ─── clear() preserves cursor (Change 1 locked decision) ───────────────


async def test_clear_preserves_last_read(tracker: UnreadTracker) -> None:
    """``clear()`` resets unread counts but leaves cursors intact.

    Locked 2026-05-04 per Change 1: a config-entry reload (which calls
    clear() via async_unload_entry's last-entry branch) must not wipe
    the user's read positions. The unread counts ARE wiped — they're
    in-memory display state.
    """
    await tracker.mark_unread("binary_sensor.alice")
    await tracker.mark_unread("binary_sensor.alice")
    await tracker.set_last_read("binary_sensor.alice", "msg_42")
    await tracker.set_last_read("binary_sensor.bob", "msg_99")

    assert tracker.get_unread("binary_sensor.alice") == 2
    assert tracker.get_last_read("binary_sensor.alice") == "msg_42"

    tracker.clear()

    # Counts wiped …
    assert tracker.get_unread("binary_sensor.alice") == 0
    assert tracker.get_all_unread() == {}
    # … cursors preserved.
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

    Simulates the ``async_unload_entry`` path: a ``set_last_read``
    schedules a 2 s debounce, HA begins shutting down before the timer
    fires, and the unload path calls ``_flush()`` to drain. Without
    this, R6 (HA shutdown loses the snapshot) would bite.
    """
    t = UnreadTracker(hass, ENTRY_ID)
    await t.async_load()

    await t.set_last_read("binary_sensor.alice", "msg_42")
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
