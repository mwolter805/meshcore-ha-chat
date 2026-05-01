"""MeshCore Chat companion integration for Home Assistant.

Two responsibilities at runtime:

  1. Per-entry message-store backend. Subscribes to events fired by the
     upstream ``meshcore`` integration (``meshcore_message``,
     ``meshcore_delivery_update``, ``meshcore_connected``,
     ``meshcore_disconnected``) and persists each chat message to a
     per-conversation store. Exposes the ``meshcore_chat/*`` WebSocket
     command namespace and an UnreadTracker singleton.

  2. Process-global sidebar panel registration. The Lit/TypeScript
     panel (under ``frontend/``) is served from this integration and
     registered once per HA process; entries beyond the first re-use
     the existing registration. The panel reads message history through
     the WS commands above and *sends* new messages via the upstream
     ``meshcore.send_*`` services — never via this integration.

The hard manifest dependency on ``meshcore`` (since 4e65769) plus the
config-flow abort (since 594c9aa) guarantee the upstream integration is
present whenever ``async_setup_entry`` runs here.
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import issue_registry as ir

from .const import (
    DOMAIN,
    EVENT_MESHCORE_CONNECTED,
    EVENT_MESHCORE_DELIVERY_UPDATE,
    EVENT_MESHCORE_DISCONNECTED,
    EVENT_MESHCORE_MESSAGE,
    MESHCORE_DOMAIN,
)
from .message_store import MessageStore
from .panel import async_register_panel, async_remove_panel
from .unread_tracking import UnreadTracker
from .utils import enrich_rx_log_entries

_LOGGER = logging.getLogger(__name__)


@dataclass
class MeshCoreChatRuntimeData:
    """Per-entry runtime state for the MeshCore Chat companion.

    Stored on ``entry.runtime_data`` (HA Bronze convention, post-2024.6).
    Process-global state (panel registration, WS commands, unread tracker)
    continues to live on ``hass.data[DOMAIN]`` because it is shared across
    config entries — though the companion's config flow is single-instance,
    so in practice there is at most one entry per HA process.
    """

    store: MessageStore


# Type alias for ConfigEntry parameterized with our runtime data shape.
# Lets typecheckers verify ``entry.runtime_data`` is the expected type.
type MeshCoreChatConfigEntry = ConfigEntry[MeshCoreChatRuntimeData]


# NOTE: ws_api.py imports ``MeshCoreChatRuntimeData`` from this module.
# Keep this import below the dataclass definition so the symbol exists on
# the partially-initialized package when ws_api.py executes its top-level
# imports during package load. The deliberate-ordering noqa silences the
# E402 module-level-import-not-at-top warning.
from .ws_api import async_register_ws_commands  # noqa: E402


async def async_setup_entry(
    hass: HomeAssistant, entry: MeshCoreChatConfigEntry
) -> bool:
    """Set up MeshCore Chat from a config entry."""
    # Test-before-setup: refuse setup until the upstream meshcore
    # integration has at least one coordinator. The chat companion is
    # useless without it, and HA will retry async_setup_entry
    # automatically when the dependency becomes ready.
    #
    # ConfigEntryNotReady alone is invisible to non-developers — HA
    # surfaces it as a generic "Setup retry" badge with no remediation
    # text. Pair it with a Repairs issue so the user gets a clickable
    # explanation of what to do (install/configure meshcore, or remove
    # meshcore_chat) on the Settings → System → Repairs page.
    if not hass.data.get(MESHCORE_DOMAIN):
        ir.async_create_issue(
            hass,
            DOMAIN,
            "upstream_meshcore_unavailable",
            is_fixable=True,
            severity=ir.IssueSeverity.ERROR,
            translation_key="upstream_meshcore_unavailable",
        )
        raise ConfigEntryNotReady(
            "Upstream meshcore integration has no active config entries — "
            "set one up via Settings → Devices & Services."
        )

    # Upstream is back (or never went away) — clear any stale repair
    # issue so the Repairs panel doesn't show a fixed problem.
    ir.async_delete_issue(hass, DOMAIN, "upstream_meshcore_unavailable")

    # Initialize the per-entry message store and load its lightweight index.
    store = MessageStore(hass, entry)
    await store.async_load_index()

    # Per-entry runtime state lives on entry.runtime_data (Bronze pattern,
    # post-2024.6). Process-global singletons (panel registration, WS
    # commands, unread tracker) continue to live on hass.data[DOMAIN].
    entry.runtime_data = MeshCoreChatRuntimeData(store=store)

    # Best-effort retention pass at startup. Failures here must not block
    # setup — they are logged and we continue.
    try:
        await store.cleanup_old_messages()
    except Exception as ex:  # pragma: no cover - defensive
        _LOGGER.warning(
            "MessageStore retention cleanup failed at startup: %s", ex
        )

    # Process-global state container — singleton flags + unread tracker.
    bucket = hass.data.setdefault(DOMAIN, {})

    # Process-global: register the sidebar panel exactly once. The panel
    # is not per-entry — the config-flow is single-instance, so in practice
    # this is also one-per-config-entry, but the guard protects against
    # accidental re-registration if that invariant ever changes.
    if not bucket.get("_panel_registered"):
        await async_register_panel(hass)
        bucket["_panel_registered"] = True
        _LOGGER.debug("MeshCore Chat panel registered")

    # Unread tracker is a process-wide singleton (not per-entry) — the
    # frontend identifies conversations by entity_id, which is globally
    # unique across config entries. Stash it on the domain bucket where the
    # WS handlers expect to find it (hass.data[DOMAIN]["unread_tracker"]).
    if "unread_tracker" not in bucket:
        bucket["unread_tracker"] = UnreadTracker(hass)

    # Register WS commands once (idempotent registration would be ideal but
    # HA's websocket_api raises on duplicate types — guard with a flag on the
    # domain bucket so multiple config entries don't collide).
    if not bucket.get("_ws_registered"):
        async_register_ws_commands(hass)
        bucket["_ws_registered"] = True

    # One-shot detection of the upstream meshcore service surface this
    # companion depends on. Surfaces an INFO line per-process so support
    # requests on degraded behavior (older meshcore) are diagnosable from
    # the HA log without re-running anything.
    if not bucket.get("_service_surface_logged"):
        bucket["_service_surface_logged"] = True
        _LOGGER.info(
            "MeshCore Chat startup — companion-integration services available: "
            "get_contacts=%s get_channels=%s trace=%s",
            hass.services.has_service(MESHCORE_DOMAIN, "get_contacts"),
            hass.services.has_service(MESHCORE_DOMAIN, "get_channels"),
            hass.services.has_service(MESHCORE_DOMAIN, "trace"),
        )

    # Subscribe to upstream meshcore events. ``entry.async_on_unload``
    # tracks each unsub callback and invokes it on unload — no manual
    # listener-list bookkeeping needed.
    entry.async_on_unload(hass.bus.async_listen(
        EVENT_MESHCORE_MESSAGE,
        _make_message_handler(hass, entry.entry_id),
    ))
    entry.async_on_unload(hass.bus.async_listen(
        EVENT_MESHCORE_DELIVERY_UPDATE,
        _make_delivery_update_handler(hass, entry.entry_id),
    ))
    entry.async_on_unload(hass.bus.async_listen(
        EVENT_MESHCORE_CONNECTED,
        _make_connection_state_handler(hass, entry.entry_id, connected=True),
    ))
    entry.async_on_unload(hass.bus.async_listen(
        EVENT_MESHCORE_DISCONNECTED,
        _make_connection_state_handler(hass, entry.entry_id, connected=False),
    ))

    # Re-run retention cleanup when options change (per-conversation cap
    # is read lazily on each save and needs no listener; retention days
    # do because the prune pass only runs at startup otherwise).
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    _LOGGER.info(
        "MeshCore Chat configured for entry %s (%d conversations indexed)",
        entry.entry_id,
        len(store.get_message_index()),
    )
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: MeshCoreChatConfigEntry
) -> bool:
    """Tear down a config entry.

    Event-bus subscriptions and the options-update listener registered in
    ``async_setup_entry`` were attached via ``entry.async_on_unload`` —
    HA invokes their unsub callbacks itself as part of the unload pipeline,
    so no manual listener loop is required here.
    """
    runtime = entry.runtime_data
    if isinstance(runtime, MeshCoreChatRuntimeData):
        await runtime.store.async_unload()

    # If this was the last config entry, drop the process-global state
    # too (panel registration, UnreadTracker counts). hass.config_entries
    # still includes the entry being unloaded at this point, so exclude
    # it explicitly when checking for siblings.
    bucket = hass.data.get(DOMAIN, {})
    other_entries = [
        e for e in hass.config_entries.async_entries(DOMAIN)
        if e.entry_id != entry.entry_id
    ]
    if not other_entries:
        if bucket.get("_panel_registered"):
            await async_remove_panel(hass)
            bucket.pop("_panel_registered", None)
            _LOGGER.debug("MeshCore Chat panel removed (last entry unloaded)")
        # WS commands live for the lifetime of the HA process — there's
        # no public unregister API. _ws_registered stays so a subsequent
        # async_setup_entry doesn't try to re-register and trip HA's
        # duplicate-registration error.
        #
        # UnreadTracker stays as the same instance (its closures may be
        # referenced by live WS handlers and the bus subscription) but
        # its in-memory counts are cleared so a re-added entry starts
        # fresh rather than inheriting stale counts from the previous
        # entry.
        tracker = bucket.get("unread_tracker")
        if tracker is not None:
            tracker.clear()

    return True


# ─── event handlers ─────────────────────────────────────────────────────


def _store_message_id(payload: dict) -> str | None:
    """Best-effort extraction of a stable message id from the event payload.

    Upstream events use the ``id`` field once a message has been written
    via the SDK helper; older paths use ``send_id`` (outgoing) or rely on
    the receiver computing the deterministic SHA-256 id (timestamp|sender|text).
    We accept either explicit field if present; we deliberately do NOT
    recompute the deterministic id here because it requires the upstream
    helper and we want to avoid duplicating that surface in the companion.
    """
    msg_id = payload.get("id") or payload.get("message_id") or payload.get("send_id")
    return str(msg_id) if msg_id else None


def _make_message_handler(hass: HomeAssistant, entry_id: str):
    """Return a listener that persists incoming/outgoing meshcore_message events."""

    async def _handle(event: Event) -> None:
        store = _resolve_store(hass, entry_id)
        if store is None:
            return

        data = event.data or {}
        entity_id = data.get("entity_id")
        if not entity_id:
            # Without an entity_id we don't know which conversation to write
            # to. The upstream meshcore integration always sets this; bail
            # quietly rather than scanning.
            return

        msg_id = _store_message_id(data)
        if not msg_id:
            # Fall back to a synthetic id from the event tuple, hashed the
            # same way the frontend's generateId() in message-parser.ts
            # does — sha256(f"{timestamp}|{sender}|{message}")[:12]. This
            # matters for live-bubble dedup: the panel renders an "rt_"
            # bubble immediately on the meshcore_message event using its
            # own hash, and reconciles against stored ids on the next
            # fetch. If the stored id is anything other than that exact
            # 12-hex digest, the rt_ bubble cannot be matched and stays
            # alongside the fetched copy → duplicate bubbles until the
            # message-store is rebuilt (e.g. on conversation switch).
            ts = data.get("timestamp", "")
            sender = data.get("sender_name", "")
            text = data.get("message") or data.get("text") or ""
            raw = f"{ts}|{sender}|{text}"
            msg_id = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]

        # Build the stored record from whatever fields the event carries.
        # Per Adaptation 4 in the proposal, missing fields like hop_count
        # and snr are simply not present in the dict.
        record: dict[str, Any] = {
            "id": msg_id,
            "sender": data.get("sender_name") or data.get("sender") or "",
            "text": data.get("message") or data.get("text") or "",
            "timestamp": data.get("timestamp", ""),
            "message_type": data.get("message_type", ""),
            "outgoing": bool(data.get("outgoing", False)),
        }
        # Optional metadata — copy through only if present.
        for k in (
            "channel",
            "channel_idx",
            "pubkey_prefix",
            "receiver_name",
            "rx_log_data",
            "repeater_count",
            "hop_count",
            "snr",
            "ack_received",
            "send_id",
            "delivery_status",
        ):
            if k in data:
                record[k] = data[k]

        # Backfill path_nodes/hop_count on rx_log entries — companion-supporting
        # dev/combined emits `path` + `path_len` but not the convenience fields
        # the frontend reads. Mirrors what feature/sidebar-panel did at source.
        if record.get("rx_log_data"):
            enrich_rx_log_entries(record["rx_log_data"])

        # Route-popup synth for DMs. Channel messages get per-repeater rx_log_data
        # arrays via the upstream RX_LOG correlation pass; DMs don't — they
        # carry hop_count + snr at the top level of the event payload (added
        # by upstream PR #215 / feature/dm-signal-metadata). The frontend's
        # message-bubble route popup keys off rx_log_data, so synthesize a
        # single-entry array from the top-level fields when only those are
        # present. The frontend then renders the popup as if it were a 1-entry
        # rx_log; no frontend changes needed.
        if record.get("hop_count") is not None and not record.get("rx_log_data"):
            synth: dict[str, Any] = {"hop_count": record["hop_count"], "synthesized": True}
            # Skip None values — the upstream event payload sometimes carries
            # snr/rssi as None rather than omitting them, and the frontend
            # renders "RSSI: null" if we pass them through unconditionally.
            if record.get("snr") is not None:
                synth["snr"] = record["snr"]
            if record.get("rssi") is not None:
                synth["rssi"] = record["rssi"]
            record["rx_log_data"] = [synth]

        # Default delivery_status. The upstream EVENT_MESHCORE_MESSAGE for
        # outgoing fires AFTER its 4-second progressive RX_LOG collection
        # window (handle_outgoing_message in upstream logbook.py) — so by
        # the time we see it, the message has been transmitted and is
        # definitively "sent". For DMs, ack_received is authoritative when
        # present. Channel messages never have ack_received.
        if record["outgoing"]:
            ack = data.get("ack_received")
            record.setdefault(
                "delivery_status",
                "delivered" if ack is True else "sent",
            )
        else:
            record.setdefault("delivery_status", "sent")

        await store.store_message(entity_id, record)

        # Inbound (non-outgoing) messages increment the unread count for
        # this conversation. Frontend listens on EVENT_UNREAD_UPDATED and
        # updates the per-conversation badge; the panel calls
        # meshcore_chat/mark_conversation_read to clear it on read.
        if not record["outgoing"]:
            tracker = hass.data.get(DOMAIN, {}).get("unread_tracker")
            if tracker is not None:
                await tracker.mark_unread(entity_id)

    return _handle


def _make_delivery_update_handler(hass: HomeAssistant, entry_id: str):
    """Return a listener that applies meshcore_delivery_update to a stored message.

    Per Adaptation 5 in the proposal: if ``entity_id`` is missing on the
    event (pre-PR-B), fall back to an all-conversations scan to locate the
    message by id.
    """

    async def _handle(event: Event) -> None:
        store = _resolve_store(hass, entry_id)
        if store is None:
            return

        data = event.data or {}
        msg_id = _store_message_id(data)
        if not msg_id:
            return

        # Progressive updates are intermediate enrichment fired from
        # handle_outgoing_message's collection passes — they carry rx_log
        # data accumulated so far but never carry an authoritative
        # delivery_status. If we computed a status from a progressive
        # event we'd downgrade an already-"sent" message back to "pending"
        # and the bubble would flip to "Waiting…" mid-flight. So for
        # progressive events, only the rx_log/repeater_count fields are
        # written; delivery_status is left to whatever the final
        # EVENT_MESHCORE_MESSAGE established.
        progressive = bool(data.get("progressive"))

        explicit_status = data.get("delivery_status")
        if explicit_status:
            status = explicit_status
        elif progressive:
            status = None  # don't touch
        else:
            status = "sent" if data.get("ack_received") else "pending"

        kwargs: dict[str, Any] = {}
        for k in ("rx_log_data", "repeater_count", "ack_received"):
            if k in data:
                kwargs[k] = data[k]

        # Enrich rx_log entries (path_nodes/hop_count derived from path/path_len)
        # before any persistence so updates and the rx_log mirror stay aligned
        # with what _make_message_handler writes.
        if "rx_log_data" in kwargs and kwargs["rx_log_data"]:
            enrich_rx_log_entries(kwargs["rx_log_data"])

        entity_id = data.get("entity_id")
        if entity_id:
            if status is not None:
                await store.update_message_delivery(
                    entity_id, msg_id, status, **kwargs
                )
            elif kwargs:
                # Status untouched, but still propagate rx_log/repeater_count
                # as a metadata-only update via the rx_data path below.
                pass
            # Some delivery updates carry the final rx_log_data — keep both
            # the rx_log mirror and the delivery row in sync.
            if "rx_log_data" in kwargs:
                await store.update_message_rx_data(
                    entity_id, msg_id, kwargs["rx_log_data"]
                )
        else:
            # Pre-PR-B: scan all conversations.
            located = None
            if status is not None:
                located = await store.update_message_delivery_any(
                    msg_id, status, **kwargs
                )
            if located and "rx_log_data" in kwargs:
                await store.update_message_rx_data(
                    located, msg_id, kwargs["rx_log_data"]
                )

    return _handle


def _make_connection_state_handler(
    hass: HomeAssistant, entry_id: str, *, connected: bool
):
    """Return a listener for meshcore_connected / meshcore_disconnected.

    The store does not currently persist node connection state — the panel
    surfaces it from binary_sensor entity state. This handler is a hook
    point for future use (e.g. inserting system messages into a
    conversation timeline). For now it is a no-op stub that exists so the
    subscription is in place and any future behavior change does not
    require an integration restart.
    """

    @callback
    def _handle(event: Event) -> None:
        _LOGGER.debug(
            "meshcore_%sconnected received (entry %s); no action taken",
            "" if connected else "dis",
            entry_id,
        )

    return _handle


def _resolve_store(hass: HomeAssistant, entry_id: str) -> MessageStore | None:
    """Look up the MessageStore for an entry, defensively."""
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or not isinstance(entry.runtime_data, MeshCoreChatRuntimeData):
        return None
    return entry.runtime_data.store


async def _async_options_updated(
    hass: HomeAssistant, entry: MeshCoreChatConfigEntry
) -> None:
    """Handle options-flow updates without requiring an HA restart.

    Retention values are read lazily from ``entry.options`` on each
    MessageStore call, so per-conversation caps take effect immediately
    on the next save. The retention-window threshold, however, is only
    applied during ``cleanup_old_messages`` — re-run it now so a tighter
    retention window prunes immediately rather than at next HA startup.
    """
    store = _resolve_store(hass, entry.entry_id)
    if store is None:
        return
    try:
        await store.cleanup_old_messages()
    except Exception as ex:  # pragma: no cover - defensive
        _LOGGER.warning("Options-update retention pass failed: %s", ex)
