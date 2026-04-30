<p align="center"><img src="assets/banner.png" alt="MeshCore Chat for Home Assistant" width="800"></p>

# MeshCore Chat for Home Assistant

A sidebar chat panel and persistent message store for the [MeshCore](https://meshcore.io) mesh radio network.

Works as a **companion** to the [core meshcore integration](https://github.com/meshcore-dev/meshcore-ha) — install both. This integration does not drive the radio itself; it adds a chat UI, message persistence, and search on top of the events and services exposed by the core integration.

> **Status:** v0.1 in active development.

## Features (v0.1)

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
<td width="50%"><a href="assets/screenshots/chat-tab.jpg"><img src="assets/screenshots/chat-tab.jpg" alt="Chat tab"></a></td>
<td width="50%"><a href="assets/screenshots/devices-tab.jpg"><img src="assets/screenshots/devices-tab.jpg" alt="Devices tab"></a></td>
</tr>
<tr>
<td><b>Chat</b> — channels and DMs in the left rail with All / Unread / DMs / Channels filters; messages rendered with sender, age, and delivery status (Repeated / Sent / Waiting).</td>
<td><b>Devices</b> — per-device sensor tiles (SNR, RSSI, airtime, battery, message counts) with a neighbor table and quick-action buttons (Flood Advert, Sync Clock, Req Telemetry, Req Status).</td>
</tr>
<tr>
<td><a href="assets/screenshots/nodes-tab.jpg"><img src="assets/screenshots/nodes-tab.jpg" alt="Nodes tab"></a></td>
<td><a href="assets/screenshots/settings-tab.jpg"><img src="assets/screenshots/settings-tab.jpg" alt="Settings tab"></a></td>
</tr>
<tr>
<td><b>Nodes</b> — full network discovery view (All / Added / Discovered, then Clients / Repeaters), with search, last-heard sort, and stale-record cleanup.</td>
<td><b>Settings</b> — companion device profile, radio configuration (TX power, frequency, bandwidth, spreading factor, coding rate, path hash mode), rename, and location.</td>
</tr>
</table>

### Chat features

<table>
<tr>
<td width="50%"><a href="assets/screenshots/chat-popup.jpg"><img src="assets/screenshots/chat-popup.jpg" alt="Message popup with route metadata"></a></td>
<td width="50%"><a href="assets/screenshots/manage-contacts-channels.jpg"><img src="assets/screenshots/manage-contacts-channels.jpg" alt="Manage contacts and channels"></a></td>
</tr>
<tr>
<td><b>Message popup</b> — click or tap any message for Copy / Reply, plus the route metadata: hop sequence, SNR, RSSI, and exact receive timestamp.</td>
<td><b>Manage contacts &amp; channels</b> — promote any discovered node to an Added contact, or remove it; channel list lives on the second tab.</td>
</tr>
</table>

### Nodes features

<table>
<tr>
<td width="50%"><a href="assets/screenshots/node-popup.jpg"><img src="assets/screenshots/node-popup.jpg" alt="Node detail popup"></a></td>
<td width="50%"><a href="assets/screenshots/trace-dialog.jpg"><img src="assets/screenshots/trace-dialog.jpg" alt="Path trace dialog"></a></td>
</tr>
<tr>
<td><b>Node details</b> — click any node tile in the Nodes tab to open quick actions (Trace, Remove Contact), public-key prefix, type, last advert, and location.</td>
<td><b>Path trace</b> — launched from the Trace quick action in the Node details dialog; pick repeaters in order to test a multi-hop path, or run a direct-neighbor probe; resolved path is shown alongside.</td>
</tr>
</table>

### Device management

<table>
<tr>
<td width="50%"><a href="assets/screenshots/device-settings.jpg"><img src="assets/screenshots/device-settings.jpg" alt="Device settings menu"></a></td>
<td width="50%"><a href="assets/screenshots/device-command.jpg"><img src="assets/screenshots/device-command.jpg" alt="Issue command picker"></a></td>
</tr>
<tr>
<td><b>Device settings menu</b> — per-device gear menu: View Hidden Sensors, Issue Command, Reboot, Start OTA Update.</td>
<td><b>Issue Command</b> — full command catalog grouped by category (Device Management, Device Info, etc.) — drives the underlying meshcore service from the panel.</td>
</tr>
<tr>
<td><a href="assets/screenshots/companion-settings.jpg"><img src="assets/screenshots/companion-settings.jpg" alt="Companion settings menu"></a></td>
<td><a href="assets/screenshots/tile-more-info.jpg"><img src="assets/screenshots/tile-more-info.jpg" alt="Sensor tile more-info"></a></td>
</tr>
<tr>
<td><b>Companion settings menu</b> — same gear menu pattern for the local companion device, with Key Management as an additional option.</td>
<td><b>Sensor history</b> — clicking any sensor tile opens Home Assistant's standard more-info dialog with full historical chart.</td>
</tr>
</table>

## Installation

### HACS (custom repository)

1. In HACS → Integrations → ⋮ → Custom repositories
2. Add `https://github.com/mwolter805/meshcore-ha-chat` as an "Integration"
3. Install **MeshCore Chat**
4. Restart Home Assistant
5. Settings → Devices & Services → Add Integration → **MeshCore Chat**

### Manual

Copy `custom_components/meshcore_chat/` into your HA `config/custom_components/` directory. Restart HA. Add the integration from the UI.

## Usage

For a walkthrough of common tasks (adding contacts, managing channels, issuing commands, tracing paths, changing radio settings) plus operational warnings (radio-reboot requirements, the entity_id rename gotcha), see [INSTRUCTIONS.md](./INSTRUCTIONS.md).

For the technical spec — every file's role, every WebSocket command, the non-obvious code paths — see [as_built.md](./as_built.md).

## Requirements

- Home Assistant 2024.12 or newer
- The core [meshcore integration](https://github.com/meshcore-dev/meshcore-ha) **v2.6.0 or newer** installed and configured. The chat companion calls the structured query services (`meshcore.get_contacts`, `meshcore.trace`) introduced in 2.6.0 (released 2026-04-27); on older versions the trace dialog returns a *"service not registered"* error and the contact list falls back to a legacy code path with a one-time warning in the logs.

## Relationship to other projects

- [meshcore-dev/meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) — the core integration that drives the MeshCore radio. **Required.**
- [Ratty7198/MeshCore-HA-UI](https://github.com/Ratty7198/MeshCore-HA-UI) — an alternative companion UI. Great work; this project differs by using a typed/compiled Lit frontend and adding per-conversation persistence, search, and a trace dialog. The two projects use distinct domains, panel URLs, and webcomponent tags so they can coexist on the same HA instance, but installing both produces two sidebar entries — pick one.

## Tips & Troubleshooting

For day-to-day usage and operational notes, see [INSTRUCTIONS.md](./INSTRUCTIONS.md).

## Development

The frontend source lives at `frontend/` (repo root). The build environment doesn't ship to HACS users — only the compiled bundle at `custom_components/meshcore_chat/meshcore-chat-panel.js` does.

To rebuild after editing source:

```
cd frontend
npm install
npm run build
```

Rollup writes the bundle directly to `../custom_components/meshcore_chat/meshcore-chat-panel.js`. Commit the rebuilt bundle when source changes.

## License

MIT — see [LICENSE](LICENSE).
