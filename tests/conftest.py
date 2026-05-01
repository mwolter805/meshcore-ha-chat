"""Root pytest config for meshcore-ha-chat.

Two responsibilities:

1. Pull in ``pytest_homeassistant_custom_component``'s plugin set, which
   provides the ``hass`` async fixture, ``MockConfigEntry``, registry
   fakes, and the rest of the HA test surface.

2. Put the repo root on ``sys.path`` BEFORE PHACC's plugin module is
   imported. Without this, ``custom_components.meshcore_chat.*`` cannot
   be resolved by ``unittest.mock.patch`` (whose target resolver walks
   the import system, not HA's loader). The PHACC distribution ships a
   sibling ``custom_components`` package under
   ``testing_config/custom_components`` — putting our repo root first on
   ``sys.path`` ensures our package wins, including the local
   ``custom_components/__init__.py`` marker added alongside this
   conftest.
"""
from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pytest

pytest_plugins = ["pytest_homeassistant_custom_component"]


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Make ``custom_components/meshcore_chat`` discoverable to HA in every test.

    PHACC's ``enable_custom_integrations`` fixture clears HA's cached
    custom-integration map so the next ``async_get_custom_components``
    call rescans ``custom_components.__path__`` — which now includes
    our repo's ``custom_components/`` thanks to the sys.path insert
    above.
    """
    yield
