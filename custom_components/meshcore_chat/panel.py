"""MeshCore Chat sidebar panel registration.

Adapted from upstream `feature/sidebar-panel:custom_components/meshcore/panel.py`.

Differences vs. upstream:
- All HTTP/sidebar URLs are scoped under `meshcore_chat` so the companion
  panel co-exists with upstream's panel if both are installed.
- Sidebar title is "MeshCore Chat" so users can tell the two apart.
- Module-URL filename matches the renamed entry point
  (`meshcore-chat-panel.js`, produced by the rollup config).
"""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel as frontend_async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

# HTTP URL the bundle is served at; module_url below points at this path.
PANEL_URL = "/meshcore_chat_panel/meshcore-chat-panel.js"
# Filesystem path to the bundle. Lives flat at the integration root since
# the rollup output is a single file (no chunks, no source maps, no other
# assets); a wrapper directory would add nothing.
PANEL_FRONTEND_PATH = str(Path(__file__).parent / "meshcore-chat-panel.js")

PANEL_ICON = "mdi:radio-handheld"
PANEL_TITLE = "MeshCore Chat"

# Sidebar URL slug — the panel will be reachable at /meshcore-chat in the HA UI.
PANEL_URL_PATH = "meshcore-chat"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the MeshCore Chat sidebar panel."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_URL, PANEL_FRONTEND_PATH, cache_headers=False)]
    )
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL_PATH,
        config={
            "_panel_custom": {
                "name": "meshcore-chat-panel",
                "module_url": PANEL_URL,
            }
        },
        require_admin=False,
    )
    _LOGGER.debug("Registered MeshCore Chat sidebar panel")


async def async_remove_panel(hass: HomeAssistant) -> None:
    """Remove the MeshCore Chat sidebar panel."""
    frontend_async_remove_panel(hass, PANEL_URL_PATH)
    _LOGGER.debug("Removed MeshCore Chat sidebar panel")
