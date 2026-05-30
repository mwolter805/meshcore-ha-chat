<p align="center"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/banner.png" alt="MeshCore Chat for Home Assistant" width="800"></p>

# MeshCore Chat for Home Assistant

A sidebar chat panel and persistent message store for the [MeshCore](https://meshcore.io) mesh radio network that was written by an agent, thoroughly reviewed and carefully tested by a human.

Works as a **companion** to the [core meshcore integration](https://github.com/meshcore-dev/meshcore-ha) — install both. This integration does not drive the radio itself; it adds a chat UI, message persistence, and search on top of the events and services exposed by the core integration.

> **Status:** v0.2 in active development.

## Features (v0.2)

- Sidebar chat panel with channels, DMs, and contact list
- Persistent message history (survives Home Assistant restarts)
- Trace / path-discovery dialog with route visualization
- Per-conversation search
- Unread counts, delivery status
- Live device telemetry, neighbor tables, and remote command issue from the same UI
- Network-wide node discovery view (typically hundreds of nodes)

## Screenshots

### The four main tabs

<table>
<tr>
<td width="50%"><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/chat-tab.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/chat-tab.jpg" alt="Chat tab"></a></td>
<td width="50%"><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/devices-tab.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/devices-tab.jpg" alt="Devices tab"></a></td>
</tr>
<tr>
<td><b>Chat</b> — channels and DMs in the left rail with All / Unread / DMs / Channels filters; messages rendered with sender, age, and delivery status (Repeated / Sent / Waiting).</td>
<td><b>Devices</b> — per-device sensor tiles (SNR, RSSI, airtime, battery, message counts) with a neighbor table and quick-action buttons (Flood Advert, Sync Clock, Req Telemetry, Req Status).</td>
</tr>
<tr>
<td><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/nodes-tab.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/nodes-tab.jpg" alt="Nodes tab"></a></td>
<td><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/settings-tab.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/settings-tab.jpg" alt="Settings tab"></a></td>
</tr>
<tr>
<td><b>Nodes</b> — full network discovery view (All / Added / Discovered, then Clients / Repeaters), with search, last-heard sort, and stale-record cleanup.</td>
<td><b>Settings</b> — companion device profile, radio configuration (TX power, frequency, bandwidth, spreading factor, coding rate, path hash mode), rename, and location. When <b>Self Diagnostics</b> is enabled in the upstream meshcore integration, the companion card also shows the same rich tiles managed devices have (battery, signal, radio activity, message counts) plus a diagnostics sensor table.</td>
</tr>
</table>

### Chat features

<table>
<tr>
<td width="50%"><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/chat-popup.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/chat-popup.jpg" alt="Message popup with route metadata"></a></td>
<td width="50%"><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/manage-contacts-channels.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/manage-contacts-channels.jpg" alt="Manage contacts and channels"></a></td>
</tr>
<tr>
<td><b>Message popup</b> — click or tap any message for Copy / Reply, plus the route metadata: hop sequence, SNR, RSSI, and exact receive timestamp.</td>
<td><b>Manage contacts &amp; channels</b> — promote any discovered node to an Added contact, or remove it; channel list lives on the second tab.</td>
</tr>
</table>

### Nodes features

<table>
<tr>
<td width="50%"><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/node-popup.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/node-popup.jpg" alt="Node detail popup"></a></td>
<td width="50%"><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/trace-dialog.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/trace-dialog.jpg" alt="Path trace dialog"></a></td>
</tr>
<tr>
<td><b>Node details</b> — click any node tile in the Nodes tab to open quick actions (Trace, Remove Contact), public-key prefix, type, last advert, and location.</td>
<td><b>Path trace</b> — launched from the Trace quick action in the Node details dialog; pick repeaters in order to test a multi-hop path, or run a direct-neighbor probe; resolved path is shown alongside.</td>
</tr>
</table>

### Device management

<table>
<tr>
<td width="50%"><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/device-settings.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/device-settings.jpg" alt="Device settings menu"></a></td>
<td width="50%"><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/device-command.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/device-command.jpg" alt="Issue command picker"></a></td>
</tr>
<tr>
<td><b>Device settings menu</b> — per-device gear menu: View Hidden Sensors, Issue Command, Reboot, Start OTA Update.</td>
<td><b>Issue Command</b> — full command catalog grouped by category (Device Management, Device Info, etc.) — drives the underlying meshcore service from the panel.</td>
</tr>
<tr>
<td><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/companion-settings.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/companion-settings.jpg" alt="Companion settings menu"></a></td>
<td><a href="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/tile-more-info.jpg"><img src="https://raw.githubusercontent.com/mwolter805/meshcore-ha-chat/main/assets/screenshots/tile-more-info.jpg" alt="Sensor tile more-info"></a></td>
</tr>
<tr>
<td><b>Companion settings menu</b> — same gear menu pattern for the local companion device, with Key Management as an additional option.</td>
<td><b>Sensor history</b> — clicking any sensor tile opens Home Assistant's standard more-info dialog with full historical chart.</td>
</tr>
</table>

## Installation

### HACS (custom repository)

[![Open meshcore-ha-chat in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=mwolter805&repository=meshcore-ha-chat&category=integration)

Click the badge above to open this repository in your HACS dashboard, or follow the manual steps:

1. In HACS → Integrations → ⋮ → Custom repositories
2. Add `https://github.com/mwolter805/meshcore-ha-chat` as an "Integration"
3. Install **MeshCore Chat**
4. Restart Home Assistant
5. Settings → Devices & Services → Add Integration → **MeshCore Chat**

### Manual

Copy `custom_components/meshcore_chat/` into your HA `config/custom_components/` directory. Restart HA. Add the integration from the UI.

## Usage

For a walkthrough of common tasks (adding contacts, managing channels, issuing commands, tracing paths, changing radio settings) plus operational warnings (radio-reboot requirements, the entity_id rename gotcha), see [INSTRUCTIONS.md](./INSTRUCTIONS.md).

> **Permissions.** Reading messages and browsing the panel works for any authenticated HA user. **Destructive actions** — radio reconfiguration, identity regeneration, channel-key changes, issuing commands, adding / removing / blocking contacts, and running path traces — require **administrator** rights on your HA instance. See [INSTRUCTIONS.md → Permissions](./INSTRUCTIONS.md#permissions) for the full list.

## Requirements

- Home Assistant 2024.12 or newer
- The core [meshcore integration](https://github.com/meshcore-dev/meshcore-ha) **v2.6.0 or newer** installed and configured. The chat companion calls the structured query services (`meshcore.get_contacts`, `meshcore.trace`) introduced in 2.6.0 (released 2026-04-27); on older versions the trace dialog returns a *"service not registered"* error and the contact list falls back to a legacy code path with a one-time warning in the logs.

## Relationship to other projects

- [meshcore-dev/meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) — the core integration that drives the MeshCore radio. **Required.**  
  [![Open meshcore-ha in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=meshcore-dev&repository=meshcore-ha&category=integration)

## Use cases

- **Off-grid mesh chat panel.** Run a tablet in your kitchen showing the MeshCore Chat sidebar; talk to local mesh peers without leaving Home Assistant.
- **Search recent traffic.** "Who pinged the @[Repeater Cliff] node yesterday?" — date-range message search across all conversations.
- **Path diagnostics.** Trace the route a message took (hops, SNR, RSSI per repeater) right from the message bubble.
- **Managed-device dashboard.** Monitor battery, last-heard, neighbour SNR, and uptime on every repeater you've added — one card per device.

## Known limitations

- **Requires meshcore ≥ 2.6.0.** Older versions fall back to direct coordinator reads where supported, but Trace and Get Contacts use upstream services that landed in 2.6.0.
- **Message archive is not a long-term log.** Default retention is 90 days, capped at 500 messages per conversation. Configurable via Settings → MeshCore Chat → Configure (range 1–365 days, 50–5000 messages).
- **Discover-mode traces don't always return.** Flood path discovery on multi-hop routes sometimes silently drops. If a **Discover** trace fails, switch to **Select repeaters** or **Enter path** in the trace dialog to specify the route explicitly.

## Removal

To uninstall:

1. Settings → Devices & Services → MeshCore Chat → ⋮ → Delete.
2. Optional: remove the message archive from disk:
   ```bash
   rm /config/.storage/meshcore_chat.*
   ```
   The archive is per-entry; deleting the config entry does not remove these files automatically (HA's standard behaviour). Skip this step if you intend to re-add the integration later — the archive will be re-attached.
3. If you also want to uninstall the underlying meshcore integration: Settings → Devices & Services → MeshCore → Delete, then remove `custom_components/meshcore` (HACS or manual).

## Development

Contributions and bug reports welcome — file issues at [github.com/mwolter805/meshcore-ha-chat/issues](https://github.com/mwolter805/meshcore-ha-chat/issues).

### Repo layout

- `custom_components/meshcore_chat/` — the Home Assistant integration (Python).
- `frontend/` — the Lit-based sidebar panel (TypeScript). Rolled up into a single bundle that lands at `custom_components/meshcore_chat/meshcore-chat-panel.js`.
- `tests/` — Python test suite (pytest + `pytest-homeassistant-custom-component`).
- `frontend/tests/` — frontend unit tests (vitest).

### Python tests

The integration targets the Python version shipped in the current HA OS / Docker image (3.14 as of HA 2025.x). Set up a local venv:

```bash
cd meshcore-ha-chat
uv venv --python 3.14 .venv
.venv/bin/pip install pytest-homeassistant-custom-component
```

`pytest-homeassistant-custom-component` (PHACC) transitively pulls in Home Assistant core, pytest, pytest-asyncio, and the full HA test fixture surface — no other install steps are needed. The integration is **not** installed as a package; `tests/conftest.py` puts the repo root on `sys.path` so `custom_components.meshcore_chat.*` is importable directly.

Run the suite:

```bash
.venv/bin/pytest tests/                    # full suite (~1s)
.venv/bin/pytest tests/components/meshcore_chat/test_ws_api.py -k identity
```

> **Do not** `pip install -e .[test]` (or any pip install) inside a running Home Assistant Docker container. The editable-install metadata persists across `pip uninstall` and crashes HA on the next restart with `FileNotFoundError` from `async_get_custom_components`. Always use a separate venv.

### Frontend

```bash
cd frontend
npm install
npm run build       # production bundle (minified)
npm run dev         # rollup watch mode
npm test            # vitest, run once
npm run test:watch  # vitest in watch mode
npm run lint        # eslint
```

The build writes straight to `../custom_components/meshcore_chat/meshcore-chat-panel.js`. Committing the rebuilt bundle does not deploy it — for that, see below.

### Deploying a dev build to a live HA host

After `npm run build`, copy the rebuilt panel bundle to your HA host:

```bash
scp custom_components/meshcore_chat/meshcore-chat-panel.js \
    root@<ha-host>:/config/custom_components/meshcore_chat/
```

Then **hard-refresh** the panel in the browser (Cmd/Ctrl-Shift-R). No Home Assistant restart is needed for frontend-only changes — the panel is reloaded from disk on browser refresh.

For Python-side changes (anything under `custom_components/meshcore_chat/*.py`), SCP the changed files and reload the integration: **Settings → Devices & Services → MeshCore Chat → ⋮ → Reload**, or restart HA if the change touches `__init__.py`, the config-flow, or anything wired at setup time.

## Tips & Troubleshooting

The integration should be fairly easy to understand and navigate, for instructions on dialog pop-ups and operational gotchas worth knowing, see [INSTRUCTIONS.md](./INSTRUCTIONS.md).

## License

MIT — see [LICENSE](LICENSE).
