# Using MeshCore Chat

A walkthrough of the day-to-day tasks the panel is built for, plus the operational gotchas worth knowing in advance. Assumes you've already followed the install steps in [README.md](./README.md) and the **MeshCore Chat** entry is in your sidebar.

If you're brand new to MeshCore itself, [meshcore.io](https://meshcore.io) is the friendlier landing page; [docs.meshcore.io](https://docs.meshcore.io) is the protocol-and-firmware reference.

For the technical spec — every file, every WebSocket command, every non-obvious code path — see [as_built.md](./as_built.md).

---

## Quick start

The panel lives in the HA sidebar under **MeshCore Chat**. It opens to the **Chat** tab; three more tabs sit along the top header: **Devices**, **Nodes**, **Settings**.

- **Chat** — channels, DMs, message history, search, route popups.
- **Devices** — per-device sensor cards for every managed repeater and client, plus action buttons (Flood Advert, Sync Clock, Req Telemetry, Req Status, Trace, Issue Command, Reboot).
- **Nodes** — full network discovery view. Every node the companion has heard, filterable by Added vs Discovered and by node type.
- **Settings** — your companion's profile, radio configuration, location source, identity, and a local Issue Command launcher.

The header carries a device switcher (when more than one upstream `meshcore` config entry is present) plus a connection status indicator. If the badge says **Offline**, the companion radio isn't talking to HA — fix that in the upstream integration before the chat panel can do anything useful.

---

## Common tasks

### Adding a contact (Discovered → Added)

A contact is **Discovered** as soon as the companion hears its advertisement on the air. It becomes **Added** when you tell the companion to keep it in its on-device contact list — at which point you can DM it, trace a path to it, and the companion will continue to maintain a route to it.

To promote one:

1. Open the **Chat** tab.
2. Click **Manage** gear icon in the top-right of the conversation list.
3. Switch to the **Contacts** sub-tab in the dialog.
4. Use the filter chips to narrow to **Discovered**, optionally **Repeaters** or **Clients**.
5. Find the node — sort by Last heard or type the name in the search box.
6. Click **Add** on its row.

The Discovered → Added flip happens on the device, not just in HA. Other peers learn about your additions implicitly via mesh advertising; you don't need to coordinate with anyone.

To go the other way, click **Remove** on an Added contact's row in the same dialog. The contact stays Discovered as long as the companion keeps hearing it; if it falls quiet for long enough you can clear it from the **Nodes** tab via **Cleanup stale**.

The same flow is available from the **Nodes** tab: click any Discovered node tile, then **Add Contact** in the detail dialog.

### Adding / removing channels

MeshCore channels are slot-based — each slot has an index, a name, and a shared key derived from the name (or supplied manually). Up to a firmware-defined maximum, typically 32 slots.

**Add or update a channel:**

1. **Chat** tab → **Manage** → **Channels** sub-tab.
2. Click **Add channel** (or click the row of an existing one to edit).
3. Pick a free slot index and a name. Leave **Auto key** ticked unless you have a reason to type a key by hand — auto-derivation matches what other clients do by default.
4. Click **Save**.

**Remove a channel:**

1. Same dialog.
2. Find the channel row and click **Remove**.

The change takes effect on the radio immediately. Other panels and other connected clients refresh on the next event tick.

### Sending commands to your companion

The **Settings** tab has an Issue Command launcher near the bottom. Use it for anything that doesn't have a dedicated UI surface — querying internal state, prodding the radio, exporting logs, etc.

1. **Settings** tab.
2. Scroll to the **Issue Command** section.
3. Pick a category from the left (Device Management, Device Info, Channel Management, etc.).
4. Pick a command. The right-hand panel populates the parameter form.
5. Fill in any required fields and click **Run**.
6. The response appears below the form. For commands that return JSON, the dialog renders the structure; for plain-text responses, the raw string.

The command set comes straight from the meshcore SDK — anything `mesh_core.commands.<method>` exposes is reachable here.

### Sending commands to a managed repeater

Repeaters and remote clients have their own CLI surface, accessed by sending login + command over the air. The Devices tab wires this into a per-card menu.

1. **Devices** tab.
2. Click the gear icon on the repeater's card.
3. **Issue Command**.
4. Same picker UI as the local launcher, but the catalogue is the **remote** command set (different shape from local because it goes through the firmware's CLI parser, not the SDK).
5. **Run**.

The companion will log in to the repeater first (using the password from the upstream `meshcore` integration's repeater config) and then fire the command. The response shows up in the dialog. If the repeater is offline, the command times out — there's no acknowledgement that the device received it, only that the radio sent it.

A small subset of common ops also have first-class buttons on the card itself — **Flood Advert**, **Sync Clock**, **Req Telemetry**, **Req Status**, **Trace**, **Reboot**. Use those instead of digging through the command catalogue when they fit.

### Changing radio settings on the companion

The companion's radio parameters — TX power, frequency, bandwidth, spreading factor, coding rate, and path hash mode — live on the **Settings** tab.

1. **Settings** tab.
2. Find the radio configuration row in the table (TX power, Frequency, Bandwidth, Spreading factor, Coding rate, Path hash mode).
3. Click the row you want to change. The HA more-info dialog opens.
4. Change the value via the upstream `meshcore` integration's normal entity-control path (some are number entities; some open an Issue Command form pre-populated for you).
5. Confirm.

Path hash mode is labelled **Path hash mode (0=1-Byte, 1=2-Byte, 2=3-Byte)** — the number is the per-hop hash width in bytes, not a bit count and not an enabled/disabled toggle. Mode 0 (1-byte) is the default and what most networks use; modes 1 and 2 trade airtime for collision resistance on networks dense enough to see hash collisions.

> **Important:** changes to any of these radio settings do not go live until the companion radio reboots. See [Operational warnings](#operational-warnings) below.

### Tracing a path to a node

A trace measures the round-trip time and per-hop SNR to a target node, optionally over a specific path.

**From the Nodes tab** (most common):

1. **Nodes** tab.
2. Click the target node tile.
3. **Trace** in the detail dialog.
4. Pick the path mode in the trace dialog:
    - **Discover (default)** — the companion runs flood path discovery and traces over whatever route comes back. This is what you want 90% of the time.
    - **Direct neighbour** — bypass routing; trace as if the target were a 1-hop neighbour. Useful for "is the radio even hearing this thing directly?".
    - **Explicit path** — type the comma-separated hex hop sequence by hand (e.g. `86,AE`). Reach for this when flood discovery isn't returning a `PATH_RESPONSE` for an otherwise-reachable target — see Session 53 / 55 in `meshcore-ha-chat_workspace_log.md` for the production case that motivated this branch.
5. **Run trace**.

**From the Devices tab:** click **Trace** on the device card's action row. Same dialog from the same target context, no node-picker step.

**From the Settings tab:** click **Trace** in the device profile area. This launches a target picker first because the Settings tab doesn't have a pre-chosen target; pick the contact you want to trace and the dialog continues normally.

The result view shows hops, total round-trip in ms, the per-hop path with SNR per hop, and the final SNR at your local radio on the echo. If the trace fails, the error toast names the failure mode (`not_in_mesh`, `path_discovery_timeout`, `send_failed`, etc.) — most of these mean "the radio link can't reach that node right now," not "your panel is broken."

> **Note:** the trace dialog requires upstream `meshcore` v2.6.0 or newer. On older versions the dialog reports a *"service not registered"* error.

---

## Operational warnings

These are the gotchas that bite users on first encounter. Read both before changing anything in Settings.

### Radio settings require a companion reboot to take effect

Changes to **TX power**, **frequency**, **bandwidth**, **spreading factor**, **coding rate**, or **path hash mode** are written to the companion's persistent config when you save them — but the running radio keeps using the previous values until the radio itself restarts.

Behaviour you'll see if you skip the reboot:
- The Settings tab shows the new value (it reflects the persisted config).
- Other nodes still hear the radio on the *old* parameters.
- Traces that should now be reachable on the new parameters fail.

To apply the change:

1. **Devices** tab (or **Settings** tab — works from either).
2. Click the gear icon on the **companion** device card.
3. **Reboot**.
4. Wait ~5 seconds for the radio to come back online; the connection status badge in the panel header flips to **Online** when it's ready.

This is a hardware/firmware constraint, not a panel limitation — the radio applies its config at boot, full stop.

### Renaming the companion changes its entity_ids in HA

The companion's **name** is the user-visible string you set in **Settings → Companion profile**. It's also what HA uses to derive the `entity_id` for every sensor and binary_sensor the upstream `meshcore` integration registers for the device.

When you rename the companion, **every meshcore entity tied to it gets a new `entity_id`.** Concretely:

```
sensor.meshcore_<oldname>_battery_percentage
                ↓
sensor.meshcore_<newname>_battery_percentage
```

Anything in your HA configuration that referenced the old `entity_id` will silently stop working. The list of things that can break:

- **Automations** — triggers, conditions, actions referencing the old IDs.
- **Scripts** — same.
- **Dashboards** — every card whose entity is the old ID renders empty after rename.
- **Template sensors** / **template binary_sensors** — `states('sensor.meshcore_oldname_*')` returns `unknown`.
- **REST and webhook integrations** — anything outside HA pulling state by entity_id.
- **Recorder filters** / **history graph customizations** — referenced IDs disappear from the recorder.

Home Assistant does **not** automatically update those references; you have to walk through them and edit by hand.

If you need to rename, the safest order is:

1. Search your HA config (UI editors and YAML) for the old name. The Configuration → Search dialog handles the UI side; `grep -ri "meshcore_oldname_" config/` handles the YAML.
2. Make a note of every reference.
3. Rename the companion via the panel.
4. Update each reference to the new ID.
5. Restart Home Assistant (or reload the affected scripts/automations) so the new IDs are picked up.

If your install is small and brand-new, a rename is no big deal. If you've built dashboards on top of the meshcore entities, plan the rename window.

---

## Tips & troubleshooting

### Refreshing the firmware version on a managed repeater card

The firmware version shown in a managed repeater's header (e.g. `Firmware: v1.14.1`) is captured by the upstream [meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) integration once at config time and is **not periodically re-queried**. After flashing new firmware on a remote repeater, the displayed version stays stale until you ask the integration to re-query.

To refresh:

1. **Settings → Devices & Services**.
2. Click the **MeshCore** integration card (the upstream one — *not* MeshCore Chat).
3. Click **Configure**.
4. Click the repeater you flashed.
5. Click **Save** — you don't need to change anything; the save action triggers a `ver` query against the repeater and updates Home Assistant's device registry.

The chat panel will pick up the new value on next refresh of the Devices tab (within ~30 s, or immediately if you switch tabs).

This is a limitation of the upstream integration, not the chat panel — the panel only displays what HA already knows. A future change to `meshcore-ha` could add `ver` to the periodic poll cycle and make this automatic.

---

## See also

- [meshcore-dev/meshcore-ha](https://github.com/meshcore-dev/meshcore-ha) — the upstream integration that drives the radio. **Required.** All radio operations (sending messages, querying device info, configuring radio parameters, managing repeaters) ultimately go through it; this companion only renders and persists.
- [meshcore.io](https://meshcore.io) — project home page.
- [docs.meshcore.io](https://docs.meshcore.io) — protocol and firmware documentation.
- [as_built.md](./as_built.md) — the technical spec for this companion: every file's role, every WebSocket command, every non-obvious code path.
- [README.md](./README.md) — installation, screenshots, requirements.
