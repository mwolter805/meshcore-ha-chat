"""Unit tests for ``custom_components.meshcore_chat.config_flow``.

Phase 4A of the HA Quality + Best Practices Remediation. Covers the
four behavioral guarantees of the config_flow module:

1. ``meshcore_not_installed`` abort when the upstream meshcore
   integration cannot be loaded (``async_get_integration`` raises
   ``IntegrationNotFound``).
2. ``single_instance_allowed`` abort when an entry already exists.
3. Happy path — meshcore present, no existing entry → flow creates the
   entry with the expected title and empty data.
4. OptionsFlow coerces ``NumberSelector`` floats to ``int`` before
   persisting to ``entry.options`` — protects downstream arithmetic in
   ``message_store`` from unexpected float types.

Tests bypass ``hass.config_entries.flow.async_init`` and exercise the
flow handler classes directly. ``flow.async_init`` triggers HA's full
dependency-setup pipeline (the manifest declares ``frontend``, ``http``,
``websocket_api``, ``meshcore``), and ``frontend`` requires the
production ``hass_frontend`` package which is unavailable in the test
environment. Direct instantiation tests the same branches without that
overhead.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.loader import IntegrationNotFound

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.meshcore_chat import config_flow
from custom_components.meshcore_chat.const import (
    OPT_MAX_MESSAGES_PER_CONVERSATION,
    OPT_MESSAGE_RETENTION_DAYS,
)

DOMAIN = "meshcore_chat"


@pytest.fixture
def user_flow() -> config_flow.MeshCoreChatConfigFlow:
    """A bare user-source ConfigFlow handler ready for ``async_step_user``."""
    flow = config_flow.MeshCoreChatConfigFlow()
    flow.context = {"source": SOURCE_USER}
    return flow


async def test_user_flow_aborts_when_meshcore_missing(
    hass: HomeAssistant, user_flow: config_flow.MeshCoreChatConfigFlow
) -> None:
    """Upstream meshcore not installed → abort with meshcore_not_installed."""
    user_flow.hass = hass
    with patch.object(
        config_flow,
        "async_get_integration",
        side_effect=IntegrationNotFound("meshcore"),
    ):
        result = await user_flow.async_step_user()

    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "meshcore_not_installed"


async def test_user_flow_aborts_when_entry_already_exists(
    hass: HomeAssistant, user_flow: config_flow.MeshCoreChatConfigFlow
) -> None:
    """Singleton guard — second entry attempts abort with single_instance_allowed."""
    existing = MockConfigEntry(domain=DOMAIN, title="MeshCore Chat", data={})
    existing.add_to_hass(hass)
    user_flow.hass = hass

    fake_integration = MagicMock()
    with patch.object(
        config_flow, "async_get_integration", return_value=fake_integration
    ):
        result = await user_flow.async_step_user()

    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_user_flow_happy_path_creates_entry(
    hass: HomeAssistant, user_flow: config_flow.MeshCoreChatConfigFlow
) -> None:
    """Meshcore present + no prior entry → flow creates the entry."""
    user_flow.hass = hass

    fake_integration = MagicMock()
    with patch.object(
        config_flow, "async_get_integration", return_value=fake_integration
    ):
        result = await user_flow.async_step_user()

    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["title"] == "MeshCore Chat"
    assert result["data"] == {}


async def test_options_flow_coerces_floats_to_ints(hass: HomeAssistant) -> None:
    """NumberSelector returns floats; entry.options must hold ints.

    ``message_store`` does ``int`` arithmetic on these values (FIFO
    trim count, retention day delta) — a stray float would propagate
    and could corrupt comparisons or storage on round-trip.
    """
    config_entry = MockConfigEntry(
        domain=DOMAIN, title="MeshCore Chat", data={}, options={}
    )
    config_entry.add_to_hass(hass)

    flow = config_flow.MeshCoreChatOptionsFlow()
    flow.hass = hass
    # OptionsFlow's ``_config_entry_id`` property returns ``self.handler``;
    # that's how the framework links a fresh OptionsFlow back to its entry.
    flow.handler = config_entry.entry_id

    # First call (no user_input) — show the form.
    result = await flow.async_step_init()
    assert result["type"] == FlowResultType.FORM

    # Second call — NumberSelector hands us floats, expect ints back.
    result = await flow.async_step_init(
        user_input={
            OPT_MAX_MESSAGES_PER_CONVERSATION: 250.0,
            OPT_MESSAGE_RETENTION_DAYS: 30.0,
        }
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["data"] == {
        OPT_MAX_MESSAGES_PER_CONVERSATION: 250,
        OPT_MESSAGE_RETENTION_DAYS: 30,
    }
    assert all(isinstance(v, int) for v in result["data"].values()), (
        "OptionsFlow must coerce NumberSelector floats to int — "
        f"got types {[type(v).__name__ for v in result['data'].values()]}"
    )


async def test_async_get_options_flow_returns_options_flow(
    hass: HomeAssistant,
) -> None:
    """``async_get_options_flow`` returns a ``MeshCoreChatOptionsFlow`` instance."""
    config_entry = MockConfigEntry(
        domain=DOMAIN, title="MeshCore Chat", data={}, options={}
    )
    config_entry.add_to_hass(hass)
    options_flow = config_flow.MeshCoreChatConfigFlow.async_get_options_flow(
        config_entry
    )
    assert isinstance(options_flow, config_flow.MeshCoreChatOptionsFlow)
