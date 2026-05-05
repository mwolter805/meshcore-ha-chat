"""Audit: every ws_api handler with ``entry_id`` in its schema must
either USE it (read ``msg.get("entry_id")`` / ``msg["entry_id"]`` in the
body) or DOCUMENT THE IGNORE (sanctioned phrase in the docstring).

Catches the F-B / F-C class of bug at merge time. A handler that
declares ``entry_id`` in its schema but never reads it (SILENT-IGNORE)
is a leaky-protocol bug: the wire-shape implies entry-scoping, the
implementation doesn't honour it. ``ws_get_unread_counts`` was the
canonical example before Phase 4 fixed it.

Categories per ``docs/Forensics - Multi-Entry Switching Analysis.md``
§F-C:
  GOOD            : passes via case (a) — body reads entry_id.
  DOCUMENTED-IGNORE: passes via case (b) — sanctioned docstring phrase.
  SILENT-IGNORE   : FAILS this test.
  PARTIAL         : passes via case (a) — does read the field. To catch
                    partials, additional integration tests are needed
                    for the actual lookup behavior; that is out of scope
                    for this static audit.

Pure source-walk — no HA runtime, no fixtures. Runs in the chat-repo's
Mac-local ``.venv`` per project CLAUDE.md §"Python Tests
(meshcore-ha-chat)".
"""
from __future__ import annotations

import ast
import pathlib
import re

# Resolve ws_api.py from the test file's location. tests/ lives at the
# repo root, ws_api.py lives at custom_components/meshcore_chat/ws_api.py.
# parents[3]: tests/components/meshcore_chat/<this> -> tests/components/
# meshcore_chat -> tests/components -> tests -> repo-root.
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
WS_API = _REPO_ROOT / "custom_components" / "meshcore_chat" / "ws_api.py"

# Sanctioned phrases that mark an intentional ignore. Add new phrases
# sparingly — every addition is a place where the protocol is leaky and
# should ideally be cleaned up rather than papered over.
SANCTIONED_DOCSTRING_PHRASES: tuple[str, ...] = (
    "intentionally NOT forwarded",
    "always uses the ``None``-fallback",
)


def _is_websocket_command_decorator(node: ast.expr) -> bool:
    """Return True if ``node`` is a ``@websocket_api.websocket_command(...)``
    decorator call.
    """
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    # Match both ``websocket_api.websocket_command(...)`` and the bare
    # ``websocket_command(...)`` import form.
    if isinstance(func, ast.Attribute) and func.attr == "websocket_command":
        return True
    if isinstance(func, ast.Name) and func.id == "websocket_command":
        return True
    return False


def _schema_declares_entry_id(decorator: ast.Call) -> bool:
    """Inspect the decorator's first arg (the schema dict literal) for an
    ``entry_id`` key wrapped in ``vol.Required(...)`` / ``vol.Optional(...)``
    or as a bare string literal.
    """
    if not decorator.args:
        return False
    schema = decorator.args[0]
    if not isinstance(schema, ast.Dict):
        return False
    for key in schema.keys:
        # ``vol.Required("entry_id")`` / ``vol.Optional("entry_id")`` →
        # Call node whose first positional arg is a Constant string.
        if isinstance(key, ast.Call) and key.args:
            first = key.args[0]
            if isinstance(first, ast.Constant) and first.value == "entry_id":
                return True
        # Bare ``"entry_id": ...`` literal (defensive — current schemas
        # don't use this form, but the audit shouldn't miss it).
        elif isinstance(key, ast.Constant) and key.value == "entry_id":
            return True
    return False


def _body_reads_entry_id(func: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    """Walk ``func``'s body for any read of ``msg["entry_id"]`` or
    ``msg.get("entry_id")``.
    """
    for node in ast.walk(func):
        # ``msg["entry_id"]`` — Subscript on Name(id='msg') with a string
        # slice.
        if (
            isinstance(node, ast.Subscript)
            and isinstance(node.value, ast.Name)
            and node.value.id == "msg"
        ):
            slc = node.slice
            # Python 3.9+: slice is the inner expression directly.
            if isinstance(slc, ast.Constant) and slc.value == "entry_id":
                return True
        # ``msg.get("entry_id", ...)`` — Call on Attribute(value=Name('msg'),
        # attr='get') with first arg a string constant.
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "get"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "msg"
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and node.args[0].value == "entry_id"
        ):
            return True
    return False


def _docstring_sanctions_ignore(
    func: ast.FunctionDef | ast.AsyncFunctionDef,
) -> bool:
    """Check the function's docstring for any sanctioned ignore phrase.

    Whitespace in the docstring is normalised to single spaces before
    matching, so phrases that happen to wrap across line boundaries
    (``"intentionally\\n    NOT forwarded"``) still match. This keeps
    the audit from becoming a regression-trap on cosmetic line-wrap
    changes that don't alter the docstring's content.
    """
    doc = ast.get_docstring(func) or ""
    flat = re.sub(r"\s+", " ", doc).strip()
    return any(phrase in flat for phrase in SANCTIONED_DOCSTRING_PHRASES)


def test_every_entry_id_schema_handler_either_uses_or_documents_the_ignore() -> None:
    """For every WS handler whose schema declares ``entry_id``, assert
    either:
      (a) the body reads ``msg.get("entry_id")`` / ``msg["entry_id"]``, or
      (b) the docstring contains a sanctioned phrase from
          ``SANCTIONED_DOCSTRING_PHRASES``.
    """
    src = WS_API.read_text()
    tree = ast.parse(src)

    failures: list[tuple[str, int]] = []
    inspected = 0

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        ws_decorator: ast.Call | None = None
        for dec in node.decorator_list:
            if _is_websocket_command_decorator(dec):
                ws_decorator = dec  # type: ignore[assignment]
                break
        if ws_decorator is None:
            continue

        if not _schema_declares_entry_id(ws_decorator):
            continue

        inspected += 1
        if _body_reads_entry_id(node):
            continue
        if _docstring_sanctions_ignore(node):
            continue

        failures.append((node.name, node.lineno))

    # Sanity check: this audit should be inspecting the full set of
    # entry_id-declaring handlers documented in forensics §F-C (29 hits
    # at HEAD 8963ec7). If the count drops to zero, the audit is silently
    # not running — likely a parser/path regression, not a clean codebase.
    assert inspected > 0, (
        f"Audit inspected zero entry_id-declaring handlers in {WS_API}. "
        "Either the schema-detection logic is broken or the file path "
        "is wrong."
    )

    assert not failures, (
        "WS handlers with ``entry_id`` in schema but no body read and no "
        "sanctioned docstring phrase (SILENT-IGNORE — see forensics "
        "§F-C):\n"
        + "\n".join(f"  {name}() at line {lineno}" for name, lineno in failures)
        + "\n\nFix options: (a) read msg.get(\"entry_id\") in the body and "
        "thread it to the appropriate resolver, or (b) document the "
        "intentional ignore in the function's docstring using one of the "
        f"sanctioned phrases: {SANCTIONED_DOCSTRING_PHRASES}."
    )
