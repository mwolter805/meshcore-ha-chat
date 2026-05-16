# Changelog

All notable changes to **MeshCore Chat for Home Assistant** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) loosely; entries are most-recent-first.

## [0.2.0] - 2026-05-09

First tagged release. Active development continues; treat this as an early preview, not a stable LTS.

### Security audit complete

A pre-public-release audit landed for this version:

- **Admin gate on 15 destructive WebSocket handlers** (b45cfc8). Non-admin HA users can no longer wipe channel keys, regenerate the companion identity, reconfigure the radio, or issue commands to managed repeaters. See [INSTRUCTIONS.md → Permissions](./INSTRUCTIONS.md#permissions) for the full list.
- **XSS hardening** (58454b8). Mention rendering escapes HTML instead of using `unsafeHTML`; regression test covers the previous attack vector.
- **Identity-dialog hardening** (21e5454). Hex validation on key fields; IMPORT flow requires typed confirmation.

### What's in 0.2.0

- Sidebar chat panel with channels, DMs, contact list, and per-message route popups (hops, SNR, RSSI, exact receive timestamp).
- Persistent message store (default 90-day / 500-msg per conversation, configurable to 1–365 days / 50–5000 msgs).
- Cross-conversation date-range search.
- Unread-count cursor — survives reloads, gates auto-mark-read on user engagement, refreshes on entry switch.
- Devices tab — per-device sensor tiles (SNR, RSSI, airtime, battery), neighbor tables, quick-action buttons, Issue Command, Reboot, Start OTA Update.
- Nodes tab — full network discovery view, filterable by Added / Discovered and by node type, with last-heard sort and stale-record cleanup.
- Settings tab — radio configuration (TX power, frequency, bandwidth, spreading factor, coding rate, path-hash mode), rename, location, Key Management.
- Trace dialog with Discover, Select repeaters, and Enter path modes.

### Requirements

- Home Assistant **2024.12** or newer.
- Core [meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) integration **v2.6.0** or newer (released 2026-04-27). 0.2.0 of the chat companion calls the structured query services (`meshcore.get_contacts`, `meshcore.trace`) introduced in 2.6.0.

### Installation

Via HACS — see the [README's Installation section](./README.md#installation). After install, restart HA and add the integration from **Settings → Devices & Services → Add Integration → MeshCore Chat**.

### Known issues

- The **Discover** trace mode (flood path discovery) sometimes silently drops on multi-hop routes. If a Discover trace fails, switch to **Select repeaters** or **Enter path** in the trace dialog to specify the route explicitly.

### Upgrading

First tagged release — no migration. If you've been tracking `main` via HACS, switch HACS to track tagged releases and pin v0.2.0.
