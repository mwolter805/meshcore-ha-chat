# MeshCore Chat for Home Assistant — As-Built

**Last updated:** 2026-04-30

## Purpose

`meshcore-ha-chat` is a **companion** HACS integration that adds a sidebar chat panel and a persistent message store on top of the core [`meshcore-ha`](https://github.com/meshcore-dev/meshcore-ha) integration. It does not own the BLE/serial radio link — `meshcore-ha` does. This integration consumes the events, services, and coordinator state that the upstream integration exposes, and renders four user-facing tabs (Chat, Devices, Nodes, Settings) plus a per-conversation message archive that survives Home Assistant restarts.

The split exists because the upstream integration is held to Home-Assistant-core review standards (no panel-custom UI, no opinionated frontend, no message archive); this companion is free to take on that scope as a separate HACS install. Users install both side by side. The upstream integration shows up in Settings → Devices & Services as the radio driver; this one shows up in the sidebar as **MeshCore Chat**.

## Architecture

### Two halves, one process

The integration runs entirely inside Home Assistant — there is no external service, no extra port, no separate daemon. There are two halves:

1. **Backend** — Python under `custom_components/meshcore_chat/`. Subscribes to four bus events fired by the upstream `meshcore` integration, persists chat messages to a per-conversation store, exposes ~29 WebSocket commands under the `meshcore_chat/*` namespace, and registers a sidebar panel exactly once per HA process.

2. **Frontend** — Lit/TypeScript under `frontend/src/`, compiled by Rollup into a single bundle at `custom_components/meshcore_chat/meshcore-chat-panel.js`. The bundle is served at `/meshcore_chat_panel/meshcore-chat-panel.js` and registered as a `panel_custom` element with the URL slug `meshcore-chat`. The frontend reads message history through the WS commands above and *sends* new messages via the upstream `meshcore.send_message` and `meshcore.send_channel_message` services — it never sends messages through this integration's surface.

### Relationship to upstream `meshcore-ha`

The relationship is asymmetric. `meshcore-chat` has a **hard manifest dependency** on `meshcore` (`"dependencies": [..., "meshcore"]`) and a config-flow precondition that aborts setup if the upstream integration isn't installed. The upstream integration knows nothing about this companion.

The companion reaches into the upstream coordinator's private state in two ways:

- **Documented public services** (preferred). `meshcore.get_contacts` and `meshcore.trace` (PR #216, shipped in upstream v2.6.0) are stable; `manifest.json` declares `_meshcore_min_version: "2.6.0"` and the WS handlers delegate to these services. A one-shot legacy fallback to `coordinator.get_all_contacts()` exists for users still on older meshcore — the WARN log fires once per process, not per call.

- **Direct private-attribute reads** (deliberate, scoped to ws_api.py). Fields the chat surface exposes are not all on the public service surface yet — channel detail dumps, repeater stats, neighbour data, tracked-device lists, blocked-contacts, etc. The companion reads `coordinator._channel_info`, `coordinator._tracked_repeaters`, `coordinator._tracked_clients`, `coordinator._discovered_contacts`, `coordinator._contacts`, `coordinator._repeater_stats`, `coordinator._repeater_neighbors`, `coordinator._created_neighbor_sensors`, `coordinator._last_successful_request`, `coordinator._stale_neighbor_days`, `coordinator._store`, plus the API surface `coordinator.api.mesh_core` (the SDK), `coordinator.api.self_info`, and `coordinator.api._cache_self_info_event`. This was a deliberate choice during the Phase 2.5 lift — duplicating the upstream coordinator into a `coordinator_facade` here would have doubled the maintenance burden. The acknowledged risk is that an upstream rename of any of these attributes will break the chat companion until it follows.

### Data flow

```
Companion radio (BLE / USB / TCP)
       │
       ▼
upstream meshcore SDK  (meshcore_py)
       │
       ▼
upstream meshcore integration
   • coordinator (DataUpdateCoordinator)
   • emits bus events:
       meshcore_message
       meshcore_delivery_update
       meshcore_connected
       meshcore_disconnected
   • exposes services:
       meshcore.send_message
       meshcore.send_channel_message
       meshcore.get_contacts          (v2.6.0+)
       meshcore.trace                 (v2.6.0+)
       …plus the device-issue services
       (flood_advert, sync_clock, ...)
   • exposes coordinator state on
       hass.data["meshcore"][entry_id]
       │
       ▼
THIS integration (meshcore_chat)
   __init__.py
   • subscribes to the 4 events above (per entry)
   • per-entry MessageStore
       persists to .storage/meshcore_chat.<entry>.msgs.<entity_id>
   • process-wide UnreadTracker singleton
   • ws_api.py registers ~29 meshcore_chat/* WS commands once per process
   • panel.py registers /meshcore-chat sidebar panel once per process
       │
       ▼
Frontend (Lit, served at /meshcore_chat_panel/meshcore-chat-panel.js)
   • meshcore-chat-panel.ts (top-level Lit element)
   • 4 tabs: Chat / Devices / Nodes / Settings
   • reads via WS, writes via upstream services
   • subscribes to bus events for live updates
       (meshcore_message, meshcore_delivery_update,
        meshcore_unread_updated, meshcore_channels_updated,
        meshcore_channel_removed)
```

### Tab structure (panel pages)

```
meshcore-chat-panel
├── Chat tab (chat-page.ts)
│      ├── conversation list (channels + DMs + filters: All / Unread / DMs / Channels)
│      ├── per-conversation message thread (lazy-load older, search)
│      ├── Manage Contacts/Channels dialog (manage-dialog.ts)
│      └── route popup (per-message: hops, SNR, RSSI, repeater path)
├── Devices tab (devices-page.ts)
│      ├── managed-repeater cards (one per tracked repeater)
│      ├── managed-client cards (one per tracked client)
│      ├── per-card: hero row + categorised sensor table
│      │      (node-summary.ts, sensor-aggregation card)
│      └── per-card actions: Flood Advert / Sync Clock /
│             Req Telemetry / Req Status / Trace / Issue Command / Reboot
├── Nodes tab (nodes-page.ts)
│      ├── full network discovery view
│      ├── filters: All / Added / Discovered → Clients / Repeaters
│      ├── search, last-heard sort, stale-record cleanup
│      └── per-node detail dialog with Trace, Remove Contact,
│             public-key prefix, type, last advert, location
└── Settings tab (settings-page.ts)
       ├── companion device profile (name, pubkey, firmware, hardware)
       ├── Radio · configuration (TX power, frequency, bandwidth,
              spreading factor, coding rate, path hash mode)
       ├── Location source (none / manual / gps / ha_location)
       ├── Identity management (regenerate / import key)
       └── Issue Command launcher for the local companion
```

A device switcher in the panel header chooses which upstream `meshcore` config entry the four tabs operate against; a single companion is the common case.

## File Inventory

### `custom_components/meshcore_chat/` — backend Python

| File | Lines | Role |
|---|---:|---|
| `__init__.py` | 424 | `async_setup_entry` / `async_unload_entry`. Subscribes to the four upstream bus events; builds the per-entry `MessageStore`; sets up the process-wide `UnreadTracker`; one-shot detection of the upstream service surface; teardown of process-global state when the last entry unloads. |
| `manifest.json` | — | HA manifest. Domain `meshcore_chat`, version `0.1.0`. `dependencies: ["frontend", "http", "websocket_api", "meshcore"]`. `integration_type: "service"`, `iot_class: "local_push"`, `_meshcore_min_version: "2.6.0"`. |
| `const.py` | 62 | `DOMAIN`, `MESHCORE_DOMAIN` (the upstream domain — used everywhere we cross the boundary), bus-event names, storage-key templates, retention tunables, default stale-neighbour days. |
| `config_flow.py` | 138 | Single-step user flow with two preconditions: the upstream `meshcore` integration must be installed (`async_get_integration` probe — `IntegrationNotFound` aborts with reason `meshcore_not_installed`) and the integration must be a singleton. `MeshCoreChatOptionsFlow` exposes two retention tunables (`max_messages_per_conversation`, `message_retention_days`). |
| `panel.py` | 65 | Sidebar registration. Serves the bundle at `/meshcore_chat_panel/meshcore-chat-panel.js` via `StaticPathConfig` and registers a `_panel_custom` element under URL slug `meshcore-chat`, title `MeshCore Chat`, icon `mdi:radio-handheld`. |
| `message_store.py` | 553 | `MessageStore` class — one instance per config entry. Lightweight always-loaded index, lazy-loaded per-conversation files, debounced 5-s saves, 5-min idle eviction, search-via-load-without-cache, retention pruning. Backfills old records on first load (rx_log enrichment, stuck-pending promotion, DM rx_log_data synth). |
| `unread_tracking.py` | 55 | `UnreadTracker` — process-wide singleton mapping `entity_id → unread_count`. Fires `meshcore_unread_updated` on the bus (namespace deliberately stays on `meshcore_*` for backward compat with frontends written for upstream's experimental sidebar-panel branch). |
| `utils.py` | 103 | `sanitize_name`, `format_entity_id` (which uses `MESHCORE_DOMAIN`, not our own `DOMAIN`, because the entities being addressed are owned by the upstream integration), and `enrich_rx_log_entries` (backfills `path_nodes` and `hop_count` on rx_log entries that pre-date the convenience-field rename). |
| `ws_api.py` | 2076 | All ~29 `meshcore_chat/*` WebSocket commands. Module-level helpers: `_get_coordinator`, `_get_all_coordinators`, `_get_contacts_via_service` (delegates to upstream service, falls back to direct read on meshcore<2.6.0), `_get_store`, `_format_event_response` (for execute_local/remote responses), `_trace_error_for` (translates upstream service error envelopes back into the chat's pre-migration `(code, message)` pairs). The trace handler has two branches: the documented-service delegation for discovery-mode traces, and an inlined explicit-path branch (`_ws_trace_explicit`) preserving the Session 53/55 multi-hop workaround. |
| `strings.json` / `translations/en.json` | — | Config-flow strings (single English locale today). Includes the `meshcore_not_installed` and `single_instance_allowed` abort reasons. |
| `meshcore-chat-panel.js` | — | Compiled Rollup bundle (~410 KB). Not edited by hand. |
| `brand/icon.png` / `icon@2x.png` | — | Sidebar branding. Served by HA's brands proxy. |

### `frontend/src/` — Lit/TypeScript

```
meshcore-chat-panel.ts          (921)  Top-level Lit element. Tab nav,
                                       device switcher, trace dialog
                                       plumbing, target-picker, error/
                                       loading state, hass-event subs.

types.ts                        (312)  Shared TS interfaces: HomeAssistant,
                                       PanelConfig, MeshCoreDevice,
                                       Contact, Channel, ManagedDevice,
                                       DeviceConfig, StoredMessage,
                                       ChatMessage, NeighborInfo, ...

api.ts                          (647)  Thin wrappers around hass.callWS /
                                       hass.callService. One async fn per
                                       WS command.

constants.ts                    (small) Regexes (channel-prefix,
                                       mention-bracket / mention-word),
                                       fetch-retry caps, MESHCORE_PRESET,
                                       DEFAULT_PANEL_CONFIG.

styles.ts                      (1208)  Shared panel CSS (Lit `css` template
                                       literal). Semantic threshold-band
                                       vars (--good / --warn / --bad / --info).

directives/long-press.ts        (small) Long-press Lit directive for
                                       sensor-tile context menu.

pages/
   chat-page.ts                (1006)  Conversation list + thread; manage-
                                       dialog wiring; message-search
                                       dialog; route popup.
   devices-page.ts             (1545)  Managed repeater + client cards;
                                       node-summary wire-up; uptime in
                                       status badge; contact-loaded
                                       fallback location; mobile overflow
                                       fix. Also owns the per-device
                                       action handlers and the inline
                                       neighbours table / SNR chart.
   nodes-page.ts                (776)  Full discovery view; filter
                                       buttons; search; per-node detail
                                       dialog with Trace + Remove Contact.
   settings-page.ts            (1633)  Companion profile + radio config +
                                       location source + identity ops +
                                       Issue Command launcher; companion
                                       descriptor synth for node-summary.
   contacts-page.ts             (207)  Manage-dialog backing data /
                                       handlers (delegated from chat-page).

components/
   node-summary.ts             (1090)  Hero-row + categorised-table card.
                                       Discriminated union over
                                       ManagedDevice | CompanionDevice-
                                       Descriptor. Owns the consumed-set
                                       de-dup pattern and the static-
                                       tooltip-vs-metricKey-tooltip merge.
   stat-bar.ts                   (~70)  Single-segment threshold bar
                                       primitive.
   stacked-bar.ts               (~135)  Multi-segment composite bar with
                                       optional inline / below legend.
   info-tip.ts                  (~110)  ⓘ button with hover/focus
                                       popover; band statement + optional
                                       citation footer.
   sensor-tile.ts               (small) Original flat tile primitive.
                                       Still used by the hidden-sensors
                                       modal preview and the inline
                                       neighbours render.
   message-bubble.ts            (485)  One chat bubble — sender, text,
                                       timestamp, delivery status,
                                       mention rendering, route popup
                                       trigger.
   conversation-list.ts         (415)  Left-rail conversation list with
                                       All / Unread / DMs / Channels
                                       filters; unread badges.
   manage-dialog.ts             (831)  Tabbed Contacts + Channels dialog;
                                       Discovered → Added promotion;
                                       channel CRUD; block / unblock.
   trace-dialog.ts              (842)  Path-trace flow: input phase
                                       (path mode picker, repeater hop
                                       picker), execution phase, result
                                       view, error view.
   target-picker.ts             (334)  Pre-trace step for the Settings-
                                       tab Trace button (settings-tab
                                       traces don't come with a pre-
                                       chosen target).
   command-dialog.ts            (417)  Issue Command UI; param picker
                                       per CommandDef.
   channel-dialog.ts            (261)  Add / edit channel form.
   channel-info-dialog.ts       (small) Channel settings dump (settings
                                       returned by ws_get_channels).
   contact-card.ts              (small) Compact contact row with quick
                                       actions.
   device-card.ts               (283)  Header for each managed device on
                                       devices-page (icon + name + status
                                       badge + uptime suffix).
   node-card.ts                 (small) Compact node tile on nodes-page.
   node-detail-dialog.ts        (429)  Per-node modal launched from a
                                       node tile click.
   neighbor-dialog.ts           (258)  Neighbour table for a given
                                       repeater (used inside the device
                                       card's expanded section).
   snr-chart.ts                 (256)  Per-neighbour SNR sparkline chart.
   message-search.ts            (377)  Cross-conversation search dialog
                                       (date range, query, results).
   confirm-dialog.ts            (small) Generic Yes/No prompt.

chat/
   message-store.ts             (699)  Frontend-side message cache.
                                       WS-event-driven live updates,
                                       optimistic outgoing-bubble
                                       rendering, lazy-load older,
                                       30-s background poll fallback.
   message-parser.ts            (291)  StoredMessage → ChatMessage
                                       transform. Includes a synchronous
                                       SHA-256 implementation that
                                       matches the backend's
                                       deterministic message-id hash so
                                       the live "rt_" bubble can dedup
                                       against the persisted record.
   entity-resolver.ts           (457)  Resolves the active conversation
                                       (channel idx vs contact prefix)
                                       to its backing binary_sensor
                                       entity for message-store reads.

commands/
   local-commands.ts           (1089)  CommandDef catalogue for "Issue
                                       Command" against the local
                                       companion.
   remote-commands.ts           (955)  CommandDef catalogue for the
                                       managed-device variant.

utils/
   classify-entity.ts           (250)  Per-entity classifier producing
                                       EntityInfo (label, icon, sortOrder,
                                       metricKey, staticTooltip).
   sensor-thresholds.ts         (292)  Threshold table + evaluateSensor.
                                       Single source of truth for the
                                       sensor-aggregation card's bands.
```

### `frontend/tests/`

| File | Role |
|---|---|
| `sensor-thresholds.test.ts` | 49 Vitest cases — one per metric × {low / mid / high} value, asserting band and tooltip prefix. |
| `vitest.config.ts` | Vitest scaffold (only frontend tests in the repo today). |

### Repo-root files

`README.md`, `INSTRUCTIONS.md`, `LICENSE`, `hacs.json`, `info.md`, `assets/banner.png`, `assets/screenshots/*.jpg`, plus the `frontend/` build env (`package.json`, `package-lock.json`, `rollup.config.mjs`, `tsconfig.json`, `vitest.config.ts`).

## Key Logic

This section covers the non-obvious behaviours that aren't apparent from a file inventory.

### Entity-class fallback chain (`classify-entity.ts`)

`classifyEntity()` reads a sensor's device class from three places in order:

1. `entity.original_device_class` — the integration-declared, immutable value from the entity registry.
2. `entity.device_class` — the user-overridden value, also from the registry.
3. `entity._stateDeviceClass` — a synthetic field injected by `loadMeshcoreEntityRegistry` from `hass.states[eid].attributes.device_class` (the live state's attribute).

The third path exists because `config/entity_registry/list` does not surface `original_device_class` on every HA install. Without the live-state fallback, every meshcore entity lands at the Step 5 generic catch-all (sortOrder 99 → "Identity") because the registry's `original_device_class` is undefined. The old flat tile grid was silently broken in the same way — every tile rendered as a neutral chip and the user couldn't tell. The `_stateDeviceClass` injection at `loadMeshcoreEntityRegistry` line 236 is what makes the new sensor-aggregation card's category headings work.

A second layer of defence-in-depth: each Step 3 / Step 4 branch matches both the device class AND a substring of the entity ID (`dc === 'battery' || eid.includes('battery_percentage')`), so the classifier still works even if the live-state attribute also fails to surface.

The classifier emits an `EntityInfo` with an optional `metricKey: MetricKey` that the threshold evaluator (`sensor-thresholds.ts`) reads. Informational metrics (TX power, raw airtime seconds, voltage, contact count) deliberately have no `metricKey` — the proposal's resolved-Q3 locks bar colour to `battery_percentage` rather than voltage, and TX power / SF / BW / frequency are flagged informational-only with no published thresholds.

### Consumed-set de-duplication in `node-summary.ts`

The hero row consumes some of the same sensors that would otherwise appear as table rows (Battery, Last message strength, Messages Sent components, Messages Received components, Requests components). To avoid double-rendering, the renderer threads a `consumed: Set<string>` (initialised at line 313) through the hero-tile builders. Each hero-tile builder calls `consumed.add(entity_id)` for every entity it incorporates. `_buildGroups()` then skips any entity whose `entity_id` is already in `consumed`.

For composite hero tiles (Messages Sent / Messages Received / Requests on managed repeaters), a single tile may consume up to five upstream sensors at once (`nb_sent` + `sent_flood` + `sent_direct`, plus `flood_dups` + `direct_dups` for Received). The consumed-set captures all of them so the user never sees the underlying counters duplicated below.

### Static tooltip vs metric-key tooltip merge (`_renderRow`)

A row may carry tooltip prose from two sources:

1. The `EntityInfo.staticTooltip` set by the classifier — used for entities that should explain themselves but don't drive a coloured band (Temperature, before iter11; some informational metrics).
2. The dynamic tooltip returned by `evaluateSensor(metricKey, value)` (`SensorEval.tooltip`) — the band statement keyed on the actual value.

`_renderRow()` at line 927 picks `info.staticTooltip || ev?.tooltip || ''` — static-tooltip wins. This lets a classifier override the threshold-table prose for entities where the band-statement framing doesn't fit (the Temperature row is the canonical case before electronics-stress thresholds were added in iter11). The merged result is wrapped in a synthetic `SensorEval` so the same `<meshcore-info-tip>` rendering path handles both cases.

### Cross-integration coupling on the upstream coordinator

`ws_api.py` reads ~10+ private attributes on the upstream `meshcore` coordinator. The breakdown:

- **Channel state** (`_channel_info`, `_fetch_all_channel_info`) — the `meshcore_chat/get_channels` WS command returns the full settings dump per channel; upstream's documented `meshcore.get_channels` service narrows the response to `{channel_idx, channel_name, shared_secret_present}`, dropping data the chat panel displays. Until upstream offers a richer service, the companion reads `_channel_info` directly.
- **Tracked-device lists** (`_tracked_repeaters`, `_tracked_clients`) — `meshcore_chat/get_managed_devices` enumerates these to populate the Devices tab.
- **Discovered/added contact dictionaries** (`_discovered_contacts`, `_contacts`) — used by `add_contact`, `remove_contact`, and `clear_discovered_contacts`. The documented `meshcore.get_contacts` service returns the unified list but doesn't expose the discovered-vs-added split that the Manage dialog needs.
- **Repeater stats and neighbours** (`_repeater_stats`, `_repeater_neighbors`, `_created_neighbor_sensors`, `_save_neighbor_data`) — `get_neighbors`, `remove_neighbor`, and `cleanup_stale_neighbors`.
- **Device-status freshness** (`_last_successful_request`) — derives per-device "online / offline / unknown" from poll history (window = max(update_interval, 300) × 2.5).
- **Blocked-contacts set** (`_blocked_contacts`) — lazily created by `set_contact_blocked`. UI-only; never reaches the device.
- **Stale-neighbour cleanup** (`_stale_neighbor_days`, `_cleanup_stale_neighbors`, `_cleanup_stale_discovered_contacts`) — coordinator-private maintenance methods.
- **API surface** (`api.connected`, `api.mesh_core`, `api.self_info`, `api._cache_self_info_event`) — direct calls into the SDK for set_device_config, execute_local, execute_remote, regenerate_key, import_key.

This is brittle by design. The Phase 2.5 lift documented the trade-off: writing a `coordinator_facade` would have doubled maintenance against a moving upstream. The tradeoff is that an upstream rename of any of these attributes will break the chat companion until it follows. Mitigations are (a) upstream's PR #217 declares `get_contacts` / `get_channels` / `trace` part of the **stable public surface**, so the eventual migration path is for upstream to offer richer-payload variants; (b) the chat-side has an integration-test instance (the home HA at `10.10.21.221`) that surfaces drift quickly.

### Message store: per-conversation files, debounced saves, idle eviction

`MessageStore` (`message_store.py`) has four storage-related characteristics worth knowing:

- **Per-conversation files.** Each conversation lands in its own HA `Store` keyed `meshcore_chat.{entry_id}.msgs.{safe_entity_id}`. The lightweight index (one entry per conversation: `message_count`, `last_message_ts`, `last_sender`, `last_preview`, ~100 bytes) lives in a separate `meshcore_chat.{entry_id}.message_index` store and is always loaded into memory.
- **5-second debounced saves.** Both per-conversation writes and index writes use `hass.loop.call_later(MESSAGE_STORE_SAVE_DELAY_SECONDS, ...)`. A burst of incoming messages during a chatty channel coalesces into one write per conversation per 5 s.
- **5-minute idle eviction.** A loaded conversation that hasn't been touched (`_conversation_last_access`) for 5 min is flushed and dropped from `_loaded_conversations`. Gives the panel a memory ceiling that doesn't grow with archive depth.
- **Search-via-load-without-cache.** `_load_for_search()` returns a transient copy of a conversation's messages without populating `_loaded_conversations`. So a global search across N conversations does not inflate memory by N conversations' worth of records — only the conversation the user actually has open stays cached.

A first-load `_backfill_messages()` migration runs on every conversation's first read after upgrade. It enriches `rx_log_data` (path_nodes + hop_count from path + path_len), promotes stuck `delivery_status: "pending"` outgoing messages to `"sent"` when there's clear evidence of transmission (non-zero `repeater_count` or non-empty `rx_log_data`), and synthesises a single-entry `rx_log_data` for DMs that carry top-level `hop_count` but no array (the route popup keys off `rx_log_data`). Migration is idempotent — it only fires if a record actually needs the change.

### Unread tracker: process-wide singleton, legacy event namespace

`UnreadTracker` lives at `hass.data["meshcore_chat"]["unread_tracker"]` (process-wide, not per-entry). The frontend identifies conversations by `entity_id`, which is globally unique across config entries, so a per-entry tracker would just mean the same accounting twice.

The bus event the tracker fires is `meshcore_unread_updated` — namespace deliberately on `meshcore_*`, not `meshcore_chat_*`. This was lifted from the upstream experimental `feature/sidebar-panel` branch and the frontend listener was not renamed when the lift happened. Any frontend code subscribing to `meshcore_unread_updated` Just Works whether running against upstream's experimental branch or this companion. Renaming the event would require a co-ordinated frontend change with no operational benefit, so it stays.

### Live-bubble dedup via deterministic message ID

When a `meshcore_message` event fires, the frontend renders an optimistic "rt_" bubble immediately and the backend persists the message. On the next message-store fetch, the persisted record comes back. To avoid showing the same message twice, the frontend computes the message ID by hashing `f"{timestamp}|{sender}|{text}"` with SHA-256 and taking the first 12 hex chars — exactly the same scheme `__init__.py` uses on the backend when the upstream event lacks an explicit `id` field.

This means `chat/message-parser.ts` ships its own synchronous SHA-256 implementation (no async crypto API; the bubble needs the ID at render time). The implementation is byte-for-byte compatible with `hashlib.sha256(...).hexdigest()[:12]`, which is checked manually by sending a known-text message and confirming dedup occurs.

### Trace flow: documented service or explicit-path bypass

The `meshcore_chat/trace` WS handler has two branches:

- **Discovery mode (default).** If the user doesn't supply an explicit path, delegate to `meshcore.trace` (PR #216, requires meshcore≥2.6.0). The upstream service was lifted from this exact code in PR #216, so behaviour is identical: round-trip 1-byte-hash path construction (`Mesh.cpp:41-66`), pre-registered `PATH_RESPONSE` listener, 15-s flood-discovery floor, `added_to_node` gate. The `_trace_error_for()` helper translates the upstream error envelope back into the chat's pre-migration `(code, message)` pairs so the frontend's toast text is unchanged.
- **Explicit-path mode.** If the user passes `path: "86,AE"` (comma-hex hops), bypass the service and call `mesh_core.commands.send_trace` directly. This branch preserves the Session 53 / Session 55 workaround — production cases where flood path discovery does not return a `PATH_RESPONSE` for an otherwise-reachable target. The MeshCoreOne iOS app has the same workaround.

Both branches return the same `TraceResult` shape (`api.ts:355`): `round_trip_ms`, `response_time` (formatted ms string), `hops`, `final_snr`, `path[]`. The frontend doesn't care which branch served the request.

## Interfaces

### WebSocket commands (`meshcore_chat/*` namespace)

All commands are registered once per process by `async_register_ws_commands(hass)` in `ws_api.py`. The `entry_id` parameter, where present, is the **upstream** `meshcore` config-entry ID — not this integration's own entry id (the companion is a singleton, so disambiguation is rarely needed; the upstream coordinator may not be).

**Discovery / device identity.**

- `meshcore_chat/get_devices` — list the upstream coordinators known to HA. Response: `{ devices: [{ entry_id, name, pubkey, pubkey_prefix, firmware, connected }] }`.
- `meshcore_chat/get_managed_devices` — list tracked repeaters and clients. Response: `{ repeaters: ManagedDevice[], clients: ManagedDevice[] }`. Each `ManagedDevice` carries `name, pubkey_prefix, password (masked), update_interval, telemetry_enabled, neighbors_enabled, disable_path_reset, connected, status, status_entity_id, firmware_version, stats`.

**Contacts.**

- `meshcore_chat/get_contacts` — full contact list (added + discovered). Delegates to `meshcore.get_contacts` (legacy fallback to `coordinator.get_all_contacts()`). Response: `{ contacts: Contact[] }`.
- `meshcore_chat/get_contacts_paginated` — filtered + sorted + paginated. Params: `category` (`all`/`added`/`discovered`), `node_type`, `search`, `limit`, `offset`, `sort_by` (`last_heard`/`name`/`prefix`). Response: `{ contacts, total, counts: { clients, repeaters, room_servers, sensors } }`.
- `meshcore_chat/get_node_counts` — primary-filter counts. Response: `{ all, added, discovered }`.
- `meshcore_chat/clear_discovered_contacts` — clear by age threshold (`days_threshold`) or all. Side effects: removes discovered binary_sensor entities from the registry. Response: `{ removed: N }`.
- `meshcore_chat/add_contact` — promote a discovered contact to added. Params: `public_key`, optional `name`. Calls `mesh_core.commands.add_contact` and updates coordinator state.
- `meshcore_chat/remove_contact` — remove an added contact. Calls `mesh_core.commands.remove_contact`.
- `meshcore_chat/get_blocked_contacts` / `meshcore_chat/set_contact_blocked` — local UI preference (a set of pubkey prefixes on the coordinator). Never reaches the device.

**Channels.**

- `meshcore_chat/get_channels` — full channel-info dump (every field in the upstream `_channel_info` map, with bytes serialized as hex). Response: `{ channels: [{ channel_idx, name, settings }] }`.
- `meshcore_chat/set_channel` — add or update. Params: `channel_idx`, `name`, optional `key` (64-char hex; `None` lets the SDK auto-derive from the name; empty string would error on the SDK side and is mapped to `None`). Side effect: re-fetches `_channel_info`, fires `meshcore_channels_updated` so other panel tabs refresh.
- `meshcore_chat/remove_channel` — clear a channel slot. Side effect: fires `meshcore_channel_removed`.

**Companion device config (Settings tab).**

- `meshcore_chat/get_device_config` — companion profile + radio config + location + path_hash_mode + connection info. Reads from `coordinator.api.self_info`. Response: a single config dict (not wrapped in a key).
- `meshcore_chat/set_device_config` — write any subset of `name`, `tx_power`, `latitude`+`longitude`, radio params (`frequency`, `bandwidth`, `spreading_factor`, `coding_rate` — all four required if any one is set; missing values are read from the current `self_info`), `path_hash_mode`. Refreshes `self_info` afterward via `send_appstart`. Response: `{ success: true, changed: ["name", "tx_power", ...] }`. **Radio settings only take effect after a companion reboot** (see `INSTRUCTIONS.md`).
- `meshcore_chat/regenerate_identity` — `mesh_core.commands.regenerate_key`. Response: `{ success: true, new_pubkey, warning: "All contacts must re-add..." }`.
- `meshcore_chat/import_identity` — `mesh_core.commands.import_key(private_key)`.
- `meshcore_chat/set_location_source` — set coordinator's `location_source` attribute. Valid: `none / manual / gps / ha_location`.

**Commanding.**

- `meshcore_chat/execute_local` — invoke any method on `coordinator.api.mesh_core.commands.<command>(**args)` against the local companion. Response: `{ response, success, timestamp }`. The Issue Command UI surfaces only the methods listed in `commands/local-commands.ts`, but the WS command itself accepts any method name on the SDK.
- `meshcore_chat/execute_remote` — login (if password) + `send_cmd(contact, command_string)` against a managed repeater or client. Params: `target_prefix`, `command`. Response: `{ response, success, timestamp }`.

**Neighbours (managed-repeater detail).**

- `meshcore_chat/get_neighbors` — neighbour table for a target repeater. Reads `coordinator._repeater_neighbors[target_prefix]`. Response: `{ neighbors: [{ name, pubkey_prefix, snr, last_seen (ISO), secs_ago, seen_48h }] }` sorted by SNR descending. Resolves `name` live (stored resolved-name may be a stale hex prefix). Computes `seen_48h` at read time from `seen_timestamps` because write-time pruning only runs during active polling.
- `meshcore_chat/remove_neighbor` — `neighbor.remove <pubkey>` over the radio + entity-registry cleanup. The cleanup logic is inlined here because `coordinator.remove_single_neighbor` was deliberately removed upstream (commit `9211499`).
- `meshcore_chat/cleanup_stale_neighbors` — manual trigger of `coordinator._cleanup_stale_neighbors(days)`.

**Trace.**

- `meshcore_chat/trace` — see §"Trace flow: documented service or explicit-path bypass" above. Params: `pubkey_prefix`, optional `entry_id`, optional `path` (comma-hex hops; presence selects explicit-path branch). Response on success: `{ round_trip_ms, response_time, hops, final_snr, path }`. Response on failure: structured error code (`not_in_mesh / contact_not_on_device / path_discovery_failed / path_discovery_rejected / path_discovery_timeout / send_failed / timeout / not_connected / service_unavailable / error`) plus a human message.

**Unread tracking.**

- `meshcore_chat/get_unread_counts` — snapshot of `UnreadTracker.get_all_unread()`. Response: `{ unread: { entity_id: count, ... } }`.
- `meshcore_chat/mark_conversation_read` — clear the count for one `entity_id` and fire `meshcore_unread_updated`.

**Stored messages (the chat archive).**

- `meshcore_chat/get_stored_messages` — paginated read for one conversation. Params: `entity_id`, `limit` (default 50), `before` / `after` (cursor message IDs). Response: `{ messages: StoredMessage[], has_more }`. Routes through the companion's `MessageStore`.
- `meshcore_chat/get_stored_message_count` — read from the in-memory index.
- `meshcore_chat/search_stored_messages` — search by text or sender. Params: `query`, optional `entity_id` (scope to one conversation), `from_date` / `to_date` (ISO strings, lex-compared), `limit`. Response: `{ results: StoredMessage[] }` with `entity_id` and `conversation_name` filled in. Uses the non-caching `_load_for_search` path so search across many conversations doesn't inflate memory.

### Bus events consumed

Subscribed by `__init__.py`:

| Event | Source | Effect in this integration |
|---|---|---|
| `meshcore_message` | upstream | Persist via `MessageStore.store_message`; bump `UnreadTracker` for inbound. Synth single-entry `rx_log_data` for DMs that carry top-level `hop_count`. |
| `meshcore_delivery_update` | upstream | Update delivery status / repeater_count / rx_log_data on the matching stored message. Progressive updates leave delivery_status alone (avoids downgrading "sent" → "pending" mid-flight). Falls back to all-conversations scan when the event lacks `entity_id`. |
| `meshcore_connected` / `meshcore_disconnected` | upstream | No-op stub. Hook point for future system-message insertion. |

### Bus events fired

| Event | Fired by | Consumer |
|---|---|---|
| `meshcore_unread_updated` | `UnreadTracker.mark_unread` / `mark_read` | Frontend conversation-list. |
| `meshcore_channels_updated` | `ws_set_channel` after `_fetch_all_channel_info` | Frontend channel list (refresh on another tab). |
| `meshcore_channel_removed` | `ws_remove_channel` | Same. |

### Services the frontend calls (on the upstream namespace)

The chat panel **never** sends messages through this integration. It calls:

- `meshcore.send_message` — DMs.
- `meshcore.send_channel_message` — channel messages.
- `meshcore.flood_advert`, `meshcore.sync_clock`, `meshcore.req_telemetry`, `meshcore.req_status` — per-device action buttons.
- `meshcore.send_command` (and friends) — Issue Command flows for actions not on the chat-WS surface.

## UI Overview

### Chat tab

Left rail conversation list (channels, then DMs) with All / Unread / DMs / Channels filters and per-row unread badges. Selecting a conversation loads the message thread on the right. Threads support lazy-loading older messages on scroll, an optimistic "rt_" bubble for outgoing messages that reconciles against the persisted record, mention rendering, and a per-message route popup (click any bubble → Copy / Reply / route metadata: hops, SNR, RSSI, exact receive timestamp). The Manage Contacts/Channels button opens a tabbed dialog for promoting Discovered contacts to Added and for channel CRUD. Cross-conversation message search lives in its own dialog with date-range filters.

### Devices tab

One card per tracked repeater and one per tracked client. Each card shows a header (icon + name + status badge, with uptime appended on online repeaters, e.g. `Online · 12d 19h`) followed by the **sensor-aggregation card** body (`<meshcore-node-summary>`): a hero row of headline tiles plus a categorised, threshold-banded sensor table for everything else. Repeaters get a 7-tile hero row (Battery / Last message strength / Radio activity / Messages Sent / Messages Received / Requests / Location); clients get 4 tiles (Battery / Last message strength / Requests / Location). Below the card body, a row of action buttons (Flood Advert / Sync Clock / Req Telemetry / Req Status / Trace / Issue Command / Reboot / Hidden Sensors) and an inline neighbour table for repeaters with `neighbors_enabled`. Clicking any sensor row opens HA's standard more-info dialog with the historical chart; long-press opens the hide-sensor menu.

### Nodes tab

Full network discovery view. Filter chips at the top: **All / Added / Discovered**, then **Clients / Repeaters / Room servers / Sensors**, plus a search box and a last-heard sort. Per-node tiles show name, type icon, last advert age, and (when available) approximate location. Clicking any tile opens a per-node detail dialog with quick actions (Trace, Remove Contact / Add Contact), public-key prefix, type, last advert, and location. Stale-record cleanup is exposed as a button driven by `meshcore_chat/clear_discovered_contacts` with a configurable age threshold.

### Settings tab

Companion device profile (name, pubkey, firmware, hardware model, max channels) at the top. Below: the same node-summary card pattern adapted for the companion (3-tile hero row: Mesh node count / Location / Power), then a Radio · configuration table (frequency, bandwidth, spreading factor, coding rate, TX power, path hash mode). The radio fields drive the Issue Command flow when changed. Companion-only options follow: Location source picker (`none / manual / gps / ha_location`), Identity management (Regenerate / Import private key, with an explicit warning about peer contact-list invalidation), and the local Issue Command launcher that exposes every method in `commands/local-commands.ts`.

### Cross-tab elements

The panel header is shared across tabs: title, device switcher (when more than one upstream `meshcore` entry is present), connection status badge, and a small battery / mesh-node count indicator for the active companion. The trace dialog (`<meshcore-trace-dialog>`) is mounted at panel level and shared by the Trace action button across the Devices, Nodes, and Settings tabs.

## Dependencies

### Python (manifest declarations)

- `frontend` — required to register the panel.
- `http` — required for `StaticPathConfig` to serve the bundle.
- `websocket_api` — required to register `meshcore_chat/*` commands.
- `meshcore` — **hard runtime dependency.** The companion does nothing useful without the upstream radio driver. After-dep is unsuitable here because the companion's WS handlers reach into the upstream coordinator at request time. `_meshcore_min_version: "2.6.0"` is declared as a non-standard manifest annotation; the legacy fallback in `_get_contacts_via_service` keeps older meshcore installs functional for contacts-only workflows.
- No external Python `requirements`. All non-stdlib code comes from HA core and the upstream `meshcore` integration's own `meshcore_py` requirement.

### Node (frontend build)

- `lit` — element framework.
- `vitest` — test runner for `frontend/tests/sensor-thresholds.test.ts` (49 cases).
- `rollup` — bundler. Output: `../custom_components/meshcore_chat/meshcore-chat-panel.js`, single file, no chunks, no source maps.
- TypeScript stack (`typescript`, `tslib`, `@types/node`).
- No runtime npm dependencies in the published bundle — `lit` is bundled in.

### Home Assistant version floor

`Home Assistant 2024.12 or newer` (per README). The actual bound is `OptionsFlow` injecting `self.config_entry` at framework level, which landed in 2024.12.

## Configuration

### Per-entry config (HA Settings → Devices & Services)

The config flow has a single user step. There is no hostname, port, token, or device picker — the companion is a service-class integration that operates against whatever upstream `meshcore` entry is present. The flow's only behaviour is to refuse setup if (a) the upstream `meshcore` integration is not installed (`meshcore_not_installed` abort), or (b) a `meshcore_chat` entry already exists (`single_instance_allowed` abort). On success the entry is titled `MeshCore Chat` with no `data` payload.

### Per-entry options (HA Settings → Devices & Services → MeshCore Chat → Configure)

Two retention tunables, both `NumberSelector` with explicit ranges:

| Key | Default | Range | Effect |
|---|---:|---|---|
| `max_messages_per_conversation` | 500 | 50–5000 (step 50) | Per-conversation FIFO cap. Excess is trimmed in `MessageStore.store_message`. |
| `message_retention_days` | 90 | 1–365 (step 1) | Age threshold. Messages older than this are pruned during the startup `cleanup_old_messages` pass. |

These options are read directly from `entry.options` by `MessageStore`, with the constants in `const.py` as fallbacks. There is no UI surface for them in the panel itself — they live in the standard HA config-entry options dialog.

### User-facing options surfaced via the panel UI

The panel's Settings tab is the user's primary control surface for runtime configuration that doesn't fit the HA config-entry model. None of these go through `entry.data` or `entry.options`; they're write-throughs to the upstream coordinator or to the companion radio:

- **Companion name** — `mesh_core.commands.set_name`. Note: changing the name re-derives every meshcore entity's `entity_id` in HA. See `INSTRUCTIONS.md`.
- **TX power, frequency, bandwidth, spreading factor, coding rate, path hash mode** — `mesh_core.commands.set_radio` / `set_tx_power` / `set_path_hash_mode`. Take effect after a companion reboot.
- **Latitude / longitude** — `mesh_core.commands.set_coords`. Altitude is hard-coded to 0 by the SDK.
- **Location source** — `none / manual / gps / ha_location`. Sets `coordinator.location_source` (companion-side preference).
- **Identity** — Regenerate (new pubkey, all peers must re-add) or Import (paste a private key).
- **Channel CRUD** (Chat tab → Manage dialog) — `meshcore_chat/set_channel` and `meshcore_chat/remove_channel`.
- **Contacts** (Chat tab → Manage dialog) — promote Discovered → Added or remove.
- **Blocked contacts** — local UI preference; per-prefix toggle stored on the coordinator's `_blocked_contacts` set.
- **Per-device sensor visibility** — long-press any sensor row on a Devices-tab card → Hide. Lives in panel-local state (frontend); the hidden list is per-device.

### Storage

HA's `storage` directory holds:

- `meshcore_chat.{entry_id}.message_index` — one JSON per entry, the lightweight per-conversation index.
- `meshcore_chat.{entry_id}.msgs.{safe_entity_id}` — one JSON per conversation, the actual message records. `safe_entity_id` is the entity's `entity_id` with `.` → `_`.

These are written through HA's `Store` helper, so they participate in the standard HA backup. No external database, no extra files outside `.storage`.
