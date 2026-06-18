"""Unit tests for ``custom_components.meshcore_chat.channel_scopes``.

The ChannelScopeStore is the durable home for per-channel region
scopes (the radio's channel slots carry no scope field). These tests
exercise the set/get/clear contract and the disk round-trip through
HA's Store helper.
"""
from __future__ import annotations

import logging
from unittest.mock import patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.meshcore_chat.channel_scopes import ChannelScopeStore


async def test_set_get_clear(hass: HomeAssistant) -> None:
    store = ChannelScopeStore(hass)
    await store.async_load()

    assert store.get("entry_a", 0) is None

    await store.async_set("entry_a", 0, "waw")
    assert store.get("entry_a", 0) == "waw"

    # Indices are independent records
    await store.async_set("entry_a", 1, "pl-mz")
    assert store.get("entry_a", 0) == "waw"
    assert store.get("entry_a", 1) == "pl-mz"

    # Entries are independent namespaces
    assert store.get("entry_b", 0) is None

    # None clears
    await store.async_set("entry_a", 0, None)
    assert store.get("entry_a", 0) is None
    assert store.get("entry_a", 1) == "pl-mz"


async def test_empty_and_whitespace_clear(hass: HomeAssistant) -> None:
    store = ChannelScopeStore(hass)
    await store.async_load()

    await store.async_set("entry_a", 0, "waw")
    await store.async_set("entry_a", 0, "")
    assert store.get("entry_a", 0) is None

    await store.async_set("entry_a", 0, "waw")
    await store.async_set("entry_a", 0, "   ")
    assert store.get("entry_a", 0) is None

    # Stored values are trimmed
    await store.async_set("entry_a", 0, "  den  ")
    assert store.get("entry_a", 0) == "den"


async def test_clearing_unset_scope_is_noop(hass: HomeAssistant) -> None:
    store = ChannelScopeStore(hass)
    await store.async_load()
    # Must not raise nor create empty structures
    await store.async_set("entry_a", 5, None)
    assert store.get("entry_a", 5) is None


async def test_persistence_round_trip(hass: HomeAssistant) -> None:
    """Scopes written by one instance are visible to a fresh load."""
    store = ChannelScopeStore(hass)
    await store.async_load()
    await store.async_set("entry_a", 2, "cos")

    reloaded = ChannelScopeStore(hass)
    await reloaded.async_load()
    assert reloaded.get("entry_a", 2) == "cos"


async def test_async_set_save_error_is_caught(
    hass: HomeAssistant, caplog: pytest.LogCaptureFixture
) -> None:
    """A Store.async_save failure is logged, not raised.

    ``async_set`` runs from a WS handler; an uncaught save failure would
    propagate out of it. The in-memory map stays updated so the next
    successful save persists the change.
    """
    caplog.set_level(logging.ERROR)
    store = ChannelScopeStore(hass)
    await store.async_load()

    with patch.object(
        store._store, "async_save", side_effect=OSError("disk full")
    ):
        await store.async_set("entry_a", 0, "waw")  # must not raise

    assert store.get("entry_a", 0) == "waw"
    assert "Failed to persist channel scope" in caplog.text
