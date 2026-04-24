"""Config flow for MeshCore Chat.

Two preconditions are enforced before an entry is created:
  1. The upstream `meshcore` integration must be installed (matches the
     hard-gate `dependencies: ["meshcore"]` in manifest.json — without
     this in-flow check, the flow would succeed and setup would then
     fail with a runtime ImportError surfaced as a generic error).
  2. Only a single instance of `meshcore_chat` may exist.

Options flow exposes two retention tunables (max messages per
conversation, retention days) that are otherwise read from
`entry.options` with hardcoded defaults — without this UI, users have
no way to actually change them.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry, OptionsFlow
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.selector import (
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
)
from homeassistant.loader import IntegrationNotFound, async_get_integration

from .const import (
    DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
    DEFAULT_MESSAGE_RETENTION_DAYS,
    OPT_MAX_MESSAGES_PER_CONVERSATION,
    OPT_MESSAGE_RETENTION_DAYS,
)

DOMAIN = "meshcore_chat"


class MeshCoreChatConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a MeshCore Chat config flow."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Single-step flow: gate on meshcore + singleton, then create entry."""
        # Hard gate: refuse to create the entry if the upstream meshcore
        # integration isn't installed. async_get_integration is the
        # canonical "is integration X available" probe — it raises
        # IntegrationNotFound without forcing a load.
        try:
            await async_get_integration(self.hass, "meshcore")
        except IntegrationNotFound:
            return self.async_abort(reason="meshcore_not_installed")

        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        return self.async_create_entry(title="MeshCore Chat", data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Return the options flow handler."""
        return MeshCoreChatOptionsFlow()


class MeshCoreChatOptionsFlow(OptionsFlow):
    """Handle MeshCore Chat options.

    Exposes the two message-store retention tunables that
    `message_store.py` already reads from `entry.options` (with the
    `DEFAULT_*` constants as fallbacks):

    - ``max_messages_per_conversation`` — per-conversation message cap;
      excess is FIFO-trimmed on each save and at startup.
    - ``message_retention_days`` — age threshold; older messages are
      pruned during the startup retention pass.

    The framework injects ``self.config_entry`` for HA 2024.12+, so we
    don't override ``__init__``.
    """

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Show / save the retention options form."""
        if user_input is not None:
            # NumberSelector returns floats; persist as int so downstream
            # arithmetic in message_store doesn't get unexpected types.
            cleaned = {
                OPT_MAX_MESSAGES_PER_CONVERSATION: int(
                    user_input[OPT_MAX_MESSAGES_PER_CONVERSATION]
                ),
                OPT_MESSAGE_RETENTION_DAYS: int(
                    user_input[OPT_MESSAGE_RETENTION_DAYS]
                ),
            }
            return self.async_create_entry(title="", data=cleaned)

        current = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Required(
                    OPT_MAX_MESSAGES_PER_CONVERSATION,
                    default=current.get(
                        OPT_MAX_MESSAGES_PER_CONVERSATION,
                        DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
                    ),
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=50,
                        max=5000,
                        step=50,
                        mode=NumberSelectorMode.BOX,
                    ),
                ),
                vol.Required(
                    OPT_MESSAGE_RETENTION_DAYS,
                    default=current.get(
                        OPT_MESSAGE_RETENTION_DAYS,
                        DEFAULT_MESSAGE_RETENTION_DAYS,
                    ),
                ): NumberSelector(
                    NumberSelectorConfig(
                        min=1,
                        max=365,
                        step=1,
                        mode=NumberSelectorMode.BOX,
                    ),
                ),
            }
        )

        return self.async_show_form(step_id="init", data_schema=schema)
