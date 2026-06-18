"""Unit tests for ``custom_components.meshcore_chat.utils``.

Covers the flood-scope helpers shared by the dialog scope picker
(``ws_get_flood_scopes``) and the inbound-label self-derive:

1. ``parse_flood_scope_allowlist`` — one source of truth for splitting the
   upstream comma-separated allowlist into named regions + the ``'*'``
   global-wildcard flag (``'#'``/blanks dropped).
2. ``derive_flood_scope`` / ``hoist_flood_scope`` — derive the per-message
   ``(flood_scope, region_scope)`` and, gated on ``wildcard_global``,
   synthesize the ``'*'`` "all regions" label for a stock-upstream-shaped
   global flood (``region_scope == False``, no upstream ``flood_scope``).
3. ``wildcard_global_allowlisted`` — reads the ``'*'`` flag off the
   upstream meshcore coordinator's config entry (where the allowlist
   lives), used by the inbound call sites to gate the self-derive.

These are pure functions; (3) takes a minimal stand-in for ``hass`` with
``.data`` mapping the upstream domain to a coordinator carrying a
``config_entry.data`` dict.
"""
from __future__ import annotations

from types import SimpleNamespace

from custom_components.meshcore_chat.const import (
    CONF_FLOOD_SCOPES_UPSTREAM,
    MESHCORE_DOMAIN,
)
from custom_components.meshcore_chat.utils import (
    derive_flood_scope,
    hoist_flood_scope,
    parse_flood_scope_allowlist,
    wildcard_global_allowlisted,
)


# ─── parse_flood_scope_allowlist ────────────────────────────────────────


def test_parse_allowlist_wildcard_and_named() -> None:
    """A leading '*' becomes the flag and stays out of the named list."""
    assert parse_flood_scope_allowlist("*, pl-mz, pl-waw") == (
        ["pl-mz", "pl-waw"],
        True,
    )


def test_parse_allowlist_named_only() -> None:
    """No '*' token → flag False; named regions returned as-is."""
    assert parse_flood_scope_allowlist("pl-mz") == (["pl-mz"], False)


def test_parse_allowlist_empty() -> None:
    """Empty string → no scopes, no wildcard."""
    assert parse_flood_scope_allowlist("") == ([], False)


def test_parse_allowlist_sentinel_only() -> None:
    """A lone '#' sentinel → no scopes, no wildcard."""
    assert parse_flood_scope_allowlist("#") == ([], False)


def test_parse_allowlist_trims_and_drops_noise() -> None:
    """Whitespace is trimmed; blanks and '#' are dropped; '*' → flag."""
    assert parse_flood_scope_allowlist(" waw, pl-mz ,, * , # ") == (
        ["waw", "pl-mz"],
        True,
    )


def test_parse_allowlist_non_string() -> None:
    """A non-string (e.g. the key absent → None default) → empty result."""
    assert parse_flood_scope_allowlist(None) == ([], False)


# ─── derive_flood_scope ─────────────────────────────────────────────────


def test_derive_global_flood_self_derives_when_allowlisted() -> None:
    """Stock-upstream-shaped global flood (region_scope False, no
    flood_scope) + wildcard_global → synthesized '*'."""
    rx = [{"region_scope": False}, {"region_scope": False}]
    assert derive_flood_scope(rx, wildcard_global=True) == ("*", False)


def test_derive_global_flood_no_label_when_not_allowlisted() -> None:
    """Same global-flood shape without the allowlist flag → no '*' label
    (region_scope still surfaces)."""
    rx = [{"region_scope": False}, {"region_scope": False}]
    assert derive_flood_scope(rx, wildcard_global=False) == (None, False)


def test_derive_regional_unchanged_regardless_of_wildcard() -> None:
    """An upstream-supplied region name is returned verbatim; the wildcard
    flag never overrides it."""
    rx = [{"flood_scope": "pl-mz", "region_scope": True}]
    assert derive_flood_scope(rx, wildcard_global=False) == ("pl-mz", True)
    assert derive_flood_scope(rx, wildcard_global=True) == ("pl-mz", True)


def test_derive_dm_no_scope_stays_none() -> None:
    """A DM-shaped entry (no region_scope) never gets the '*' label even
    when allowlisted — the gate is `is False`, not falsy."""
    rx = [{"hop_count": 2}]
    assert derive_flood_scope(rx, wildcard_global=True) == (None, None)


def test_derive_empty_returns_none() -> None:
    """No rx_log_data → (None, None)."""
    assert derive_flood_scope(None, wildcard_global=True) == (None, None)
    assert derive_flood_scope([], wildcard_global=True) == (None, None)


# ─── hoist_flood_scope ──────────────────────────────────────────────────


def test_hoist_global_flood_when_allowlisted() -> None:
    """Hoisting a stock-upstream global flood with the flag set stamps
    flood_scope='*' and region_scope=False on the record."""
    msg = {
        "id": "g1",
        "rx_log_data": [{"region_scope": False}, {"region_scope": False}],
    }
    assert hoist_flood_scope(msg, wildcard_global=True) is True
    assert msg["flood_scope"] == "*"
    assert msg["region_scope"] is False


def test_hoist_global_flood_no_label_when_not_allowlisted() -> None:
    """Without the flag, the same record hoists region_scope but no
    flood_scope label."""
    msg = {
        "id": "g2",
        "rx_log_data": [{"region_scope": False}, {"region_scope": False}],
    }
    assert hoist_flood_scope(msg, wildcard_global=False) is True
    assert "flood_scope" not in msg
    assert msg["region_scope"] is False


def test_hoist_regional_unchanged() -> None:
    """A region-named flood hoists its name regardless of the flag."""
    msg = {"id": "r1", "rx_log_data": [{"flood_scope": "pl-mz", "region_scope": True}]}
    assert hoist_flood_scope(msg, wildcard_global=True) is True
    assert msg["flood_scope"] == "pl-mz"
    assert msg["region_scope"] is True


def test_hoist_no_rx_log_is_noop() -> None:
    """A message with no rx_log_data gains no scope fields."""
    msg = {"id": "n1"}
    assert hoist_flood_scope(msg, wildcard_global=True) is False
    assert "flood_scope" not in msg
    assert "region_scope" not in msg


# ─── wildcard_global_allowlisted ────────────────────────────────────────


def _fake_hass(flood_scopes: str | None):
    """Minimal hass stand-in: hass.data[MESHCORE_DOMAIN] → {entry_id: coord},
    coord.config_entry.data carrying the allowlist (or omitting it when
    ``flood_scopes`` is None)."""
    data: dict = {}
    if flood_scopes is not None:
        data[CONF_FLOOD_SCOPES_UPSTREAM] = flood_scopes
    coord = SimpleNamespace(config_entry=SimpleNamespace(data=data))
    return SimpleNamespace(data={MESHCORE_DOMAIN: {"entry1": coord}})


def test_wildcard_allowlisted_true() -> None:
    assert wildcard_global_allowlisted(_fake_hass("*, pl-mz")) is True


def test_wildcard_allowlisted_false() -> None:
    assert wildcard_global_allowlisted(_fake_hass("pl-mz")) is False


def test_wildcard_allowlisted_absent_key() -> None:
    assert wildcard_global_allowlisted(_fake_hass(None)) is False


def test_wildcard_allowlisted_no_coordinator() -> None:
    """No upstream coordinator registered → False (not an error)."""
    assert wildcard_global_allowlisted(SimpleNamespace(data={})) is False
