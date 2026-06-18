# Security posture

This document describes how MeshCore Chat handles untrusted data and where its trust boundaries are. It is a statement of design intent, not a guarantee or a point-in-time scan result. For the live signal, see the automated checks linked at the end.

## Threat model

MeshCore Chat displays data that originates on a mesh radio network. Any node within radio range can broadcast values the panel later renders — node advertised names (`adv_name`), message text, and channel or sender names. These are **untrusted inputs**: an attacker in range can choose them freely, and there is no character validation at the protocol level.

The relevant trust boundary is therefore the **render layer** — the point where mesh-sourced strings become what a Home Assistant user sees in the panel. The class of issue this guards against is cross-site scripting (XSS) through a hostile node name or message. This class is not hypothetical in the MeshCore ecosystem: CVE-2026-45323 was a critical node-name XSS in a different Home Assistant MeshCore component (`meshcore-card`), where advertised names were rendered without escaping.

## How untrusted data is handled

**Output encoding at the render layer.** The panel is built with [Lit](https://lit.dev). Lit's templating auto-escapes interpolated values by default, so mesh-sourced strings are rendered as text rather than markup. The frontend does not use `innerHTML`, Lit's `unsafeHTML` directive, or any other raw-HTML injection sink, and it does not embed a map/Leaflet surface or build inline event-handler strings. Untrusted values reach the DOM only through Lit's escaped interpolation.

**Authorization on the WebSocket API.** The panel communicates with the backend over a namespaced WebSocket API. Every command that changes a device or its configuration — radio reconfiguration, identity regeneration, channel-key changes, contact add / remove / block, command issuance, and path traces — requires Home Assistant **administrator** rights. Read-only commands and the per-user read-tracking commands (fetching messages and contacts, marking a conversation read) remain available to any authenticated user. This matches the permission split documented for end users in the README and the usage notes.

**Input validation.** Each WebSocket command declares a schema, and malformed payloads are rejected before they reach handler logic. Data read back from disk is type-checked on load: a value of the wrong shape is logged and falls back to an empty default rather than being trusted or rewritten.

**Persistence.** Message history and related state are written through Home Assistant's `Store` helper rather than raw file I/O, keeping persistence within Home Assistant's storage conventions.

## Automated checks

The repository runs automated security checks whose status is published as externally-computed badges in the [README Security section](../README.md#security):

- **CodeQL** code scanning for Python and TypeScript.
- **OpenSSF Scorecard** for supply-chain health metrics.
- **Dependabot** for dependency and GitHub Actions updates.

These run continuously and are the live signal; this document describes the durable design they complement. It is re-touched only when the render layer or the WebSocket authorization model changes.

## Reporting

Found something? Please report it privately — see [SECURITY.md](../SECURITY.md) for the disclosure process.
