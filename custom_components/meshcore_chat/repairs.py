"""Repair issue handlers for MeshCore Chat.

Issues registered:

  * upstream_meshcore_unavailable — fired by ``async_setup_entry`` when
    the upstream meshcore integration has no coordinators (covers the
    case where it was uninstalled or had its config entries removed
    while meshcore_chat is still configured). The issue auto-clears on
    the next successful ``async_setup_entry`` (when an upstream
    coordinator reappears).

The fix flow is a single confirm step — the user can't actually repair
this from inside HA's repair surface (the fix requires re-installing or
re-configuring the upstream meshcore integration), so the flow exists
to let the user acknowledge the issue and dismiss it. The translated
description in ``strings.json`` tells them what to do next.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult


class UpstreamMeshcoreUnavailableRepairFlow(RepairsFlow):
    """Repair flow for the upstream-meshcore-not-configured issue."""

    def __init__(self, data: dict[str, Any] | None) -> None:
        """Initialize the flow with optional issue data."""
        self._data = data or {}

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Entry point — delegate to the confirm step."""
        return await self.async_step_confirm()

    async def async_step_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Single confirm step — user acknowledges, the issue dismisses.

        The actual fix (re-installing/re-configuring the upstream
        meshcore integration, or removing meshcore_chat) happens
        outside this flow. The issue auto-clears next time
        ``async_setup_entry`` succeeds; this acknowledgement just
        suppresses it from the Repairs panel until then.
        """
        if user_input is not None:
            return self.async_create_entry(title="", data={})
        return self.async_show_form(
            step_id="confirm", data_schema=vol.Schema({})
        )


async def async_create_fix_flow(
    hass: HomeAssistant,
    issue_id: str,
    data: dict[str, str | int | float | None] | None,
) -> RepairsFlow:
    """Create a repair fix flow for the given issue id."""
    if issue_id == "upstream_meshcore_unavailable":
        return UpstreamMeshcoreUnavailableRepairFlow(data)
    raise NotImplementedError(f"Unknown repair issue: {issue_id}")
