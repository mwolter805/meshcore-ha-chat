"""Compatibility contracts for selected-radio settings and message events."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import asyncio

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.meshcore_chat import (
    MeshCoreChatRuntimeData, _make_message_handler, _make_delivery_update_handler,
)
from custom_components.meshcore_chat.message_store import MessageStore
from custom_components.meshcore_chat.utils import wildcard_global_allowlisted
from custom_components.meshcore_chat import ws_api
from homeassistant.core import Context, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr


@pytest.mark.parametrize("result", [{"event": "OK"}, {"error": "denied"}, {"error_code": 7}, {"reason": "timeout"}, None])
async def test_modern_commands_preserve_context_errors_and_no_raw_fallback(hass, result):
    class API:
        async def exchange(self):
            raise AssertionError("Do not bypass the parent service")

        @property
        def mesh_core(self):
            raise AssertionError("Do not access the deprecated SDK")

    context = Context(user_id="actual-websocket-user")
    connection = SimpleNamespace(context=lambda _: context)
    coordinator = SimpleNamespace(api=API(), config_entry=SimpleNamespace(entry_id="radio-a"))
    calls = []

    async def service(call):
        calls.append(call)
        return result

    hass.services.async_register("meshcore", "execute_command", service, supports_response=SupportsResponse.OPTIONAL)
    if result == {"event": "OK"}:
        response = await ws_api._parent_command(hass, connection, {"id": 1}, coordinator, "set_name", "O'Brien (test)")
        assert response.payload == result
    else:
        with pytest.raises(HomeAssistantError):
            await ws_api._parent_command(hass, connection, {"id": 1}, coordinator, "set_name", "O'Brien (test)")
    assert calls[0].context is context
    assert calls[0].data["entry_id"] == "radio-a"
    import ast
    expression = ast.parse(calls[0].data["command"], mode="eval").body
    assert ast.literal_eval(expression.args[0]) == "O'Brien (test)"


async def test_modern_service_denial_never_falls_back(hass):
    class API:
        async def exchange(self):
            raise AssertionError("no direct fallback")
        @property
        def mesh_core(self):
            raise AssertionError("no SDK fallback")
    async def denied(call):
        raise HomeAssistantError("command_denied")
    hass.services.async_register("meshcore", "execute_command", denied, supports_response=SupportsResponse.OPTIONAL)
    with pytest.raises(HomeAssistantError, match="command_denied"):
        await ws_api._parent_command(hass, SimpleNamespace(context=lambda _: Context(user_id="user")), {}, SimpleNamespace(api=API(), config_entry=SimpleNamespace(entry_id="a")), "get_msg")


@pytest.mark.parametrize("legacy_lookup", [False, True])
async def test_device_registry_lookup_is_scoped_to_config_entry(hass, monkeypatch, legacy_lookup):
    entries = []
    for entry_id in ("radio-a", "radio-b"):
        entry = MockConfigEntry(domain="meshcore", entry_id=entry_id, data={})
        entry.add_to_hass(hass)
        entries.append(entry)
    registry = dr.async_get(hass)
    modern_registry = callable(getattr(registry, "async_get_device_by_identifier", None))
    if legacy_lookup and not modern_registry:
        pytest.skip("The older registry already exercises the fallback in the other case")
    identifier = ("meshcore", "radio-a_repeater_abcdef123456")
    a = registry.async_get_or_create(config_entry_id="radio-a", identifiers={identifier}, sw_version="A")
    second_identifier = identifier if modern_registry else ("meshcore", "radio-b_repeater_abcdef123456")
    b = registry.async_get_or_create(config_entry_id="radio-b", identifiers={second_identifier}, sw_version="B")
    assert a.id != b.id, "The actual registry must model duplicate identifiers across entries"
    if modern_registry:
        assert registry.async_get_device_by_identifier(identifier, "radio-a").id == a.id
        assert registry.async_get_device_by_identifier(identifier, "radio-b").id == b.id
    if legacy_lookup:
        monkeypatch.setattr(type(registry), "async_get_device_by_identifier", None)
    coord = SimpleNamespace(config_entry=entries[0], api=SimpleNamespace(connected=True), _tracked_repeaters=[{"pubkey_prefix": "abcdef123456"}], _tracked_clients=[], _repeater_stats={}, _last_successful_request={})
    hass.data["meshcore"] = {"radio-a": coord}
    results = []
    connection = SimpleNamespace(send_result=lambda _, result: results.append(result))
    ws_api.ws_get_managed_devices(hass, connection, {"id": 1, "entry_id": "radio-a"})
    assert results[0]["repeaters"][0]["firmware_version"] == "A"


def test_regions_options_clear_and_radio_isolation(hass):
    hass.data["meshcore"] = {
        "a": SimpleNamespace(config_entry=SimpleNamespace(data={"flood_scopes": "*"}, options={"flood_scopes": ""})),
        "b": SimpleNamespace(config_entry=SimpleNamespace(data={}, options={"flood_scopes": "*"})),
    }
    assert wildcard_global_allowlisted(hass, "a") is False
    assert wildcard_global_allowlisted(hass, "b") is True
    assert wildcard_global_allowlisted(hass, "missing") is False
    assert wildcard_global_allowlisted(hass) is False


@pytest.mark.parametrize("message_type,ack,status", [("channel", None, "sent"), ("direct", True, "delivered"), ("direct", False, "sent")])
async def test_terminal_delivery_and_observation_persist(hass, message_type, ack, status):
    entry = MockConfigEntry(domain="meshcore_chat", entry_id="chat", data={})
    entry.add_to_hass(hass)
    store = MessageStore(hass, entry)
    entry.runtime_data = MeshCoreChatRuntimeData(store=store)
    await store.async_load_index()
    data = {"entity_id": "binary_sensor.synthetic", "send_id": "send-a", "message_type": message_type,
            "sender_name": "Radio", "message": "hi", "timestamp": "2026-10-30T12:00:00+00:00", "outgoing": True,
            "repeats_observable": False, "collecting": True}
    if ack is not None:
        data["ack_received"] = ack
    try:
        await _make_message_handler(hass, "chat")(SimpleNamespace(data=data))
        for progressive in (True, False, False, True):
            await _make_delivery_update_handler(hass, "chat")(SimpleNamespace(data={**data, "progressive": progressive}))
        row = store._loaded_conversations[data["entity_id"]][0]
        assert row["delivery_status"] == status
        assert row["repeats_observable"] is False
        assert row["collecting"] is False
        await store.flush()
        store._loaded_conversations.clear()
        rows = await store._ensure_loaded(data["entity_id"])
        assert rows[0]["repeats_observable"] is False
        assert rows[0]["collecting"] is False
        await store.update_message_delivery(data["entity_id"], "send-a", "failed")
        await _make_delivery_update_handler(hass, "chat")(SimpleNamespace(data={**data, "progressive": False}))
        assert rows[0]["delivery_status"] == "failed"
    finally:
        await store.async_unload()


async def test_unnamed_sender_has_same_persisted_identity(hass):
    entry = MockConfigEntry(domain="meshcore_chat", entry_id="chat", data={})
    entry.add_to_hass(hass)
    store = SimpleNamespace(store_message=AsyncMock())
    entry.runtime_data = MeshCoreChatRuntimeData(store=store)
    await _make_message_handler(hass, "chat")(SimpleNamespace(data={"entity_id": "binary_sensor.synthetic", "sender_name": None, "pubkey_prefix": "abcdef123456", "message": "hi", "timestamp": "2026-10-30T12:00:00Z"}))
    row = store.store_message.call_args.args[1]
    assert row["sender"] == "abcdef123456"


async def test_concurrent_first_load_keeps_message_and_terminal_update(hass, monkeypatch, hass_storage):
    entry = MockConfigEntry(domain="meshcore_chat", entry_id="chat-load", data={})
    entry.add_to_hass(hass)
    store = MessageStore(hass, entry)
    await store.async_load_index()
    entity = "binary_sensor.first_load"
    backing = store._store_for(entity)
    assert backing.key not in hass_storage and entity not in store._loaded_conversations
    original = backing.async_load
    started, release, update_entered = asyncio.Event(), asyncio.Event(), asyncio.Event()
    reads = 0

    async def delayed_read():
        nonlocal reads
        reads += 1
        started.set()
        await release.wait()
        return await original()

    async def update():
        update_entered.set()
        await store.update_message_delivery(entity, "send-a", "sent", collecting=False)

    monkeypatch.setattr(backing, "async_load", delayed_read)
    message = {"id": "send-a", "sender": "Radio", "text": "hi", "timestamp": "2026-10-30T12:00:00Z", "outgoing": True, "message_type": "channel", "delivery_status": "sent", "collecting": True}
    first = asyncio.create_task(store.store_message(entity, message))
    second = None
    try:
        await asyncio.wait_for(started.wait(), 1)
        second = asyncio.create_task(update())
        await asyncio.wait_for(update_entered.wait(), 1)
        assert not first.done() and not second.done(), "Both handlers must overlap before storage releases"
        release.set()
        await asyncio.gather(first, second)
        rows = await store.get_messages(entity)
        assert len(rows) == 1
        assert reads == 1
        assert rows[0]["collecting"] is False
        await store.flush()
        store._loaded_conversations.clear()
        assert (await store._ensure_loaded(entity))[0]["collecting"] is False
    finally:
        release.set()
        await asyncio.gather(first, *([second] if second else []), return_exceptions=True)
        await store.async_unload()
