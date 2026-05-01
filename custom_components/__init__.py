"""Repo-local ``custom_components`` package marker.

Present so ``custom_components`` resolves as a regular package (with this
file as ``__init__.py``) when the repo root is on ``sys.path`` during
tests. Without it, Python finds PHACC's
``pytest_homeassistant_custom_component/testing_config/custom_components/``
first because that one ships an ``__init__.py``, and our integration
becomes unimportable from the test harness.

HACS installs the per-integration directory
(``custom_components/meshcore_chat/``) only — this top-level marker is
not shipped to the user's HA config dir.
"""
