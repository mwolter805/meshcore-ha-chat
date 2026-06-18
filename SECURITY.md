# Security Policy

## Supported versions

MeshCore Chat is a pre-1.0 Home Assistant integration distributed through HACS. Security fixes are applied to the latest released version only — please update to the most recent release before reporting an issue.

| Version | Supported |
| ------- | --------- |
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

Please report security vulnerabilities **privately** so they can be fixed before public disclosure. Do **not** open a public GitHub issue for a security problem.

Use GitHub's private vulnerability reporting:

1. Open the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Describe the issue, the affected version, and steps to reproduce.

You can expect an acknowledgement **within 7 days**. Once a report is confirmed, a fix is coordinated and released before the details are disclosed publicly, and your contribution is credited if you would like.

## Scope

MeshCore Chat is a companion integration that runs inside Home Assistant. It adds a chat panel and a message store on top of the core [`meshcore`](https://github.com/meshcore-dev/meshcore-ha) integration, which owns the radio link.

In scope for a report against this integration:

- Output encoding of untrusted, mesh-sourced data (node names, message text, channel and sender names) in the panel.
- Authorization of the WebSocket API the panel uses — which commands require a Home Assistant administrator versus any authenticated user.
- Input validation of the WebSocket commands and of stored data read back from disk.

Out of scope — these are Home Assistant platform behavior rather than this integration:

- Home Assistant's trust model treats every logged-in user as a member of the household; per-user permissions beyond the administrator / non-administrator split are a Home Assistant core concern.
- Installation of add-ons and integrations is user-initiated and trusted by design.
- Vulnerabilities in Home Assistant Core, Home Assistant OS, or the core `meshcore` integration should be reported to those projects.

For a design-level description of how untrusted data is handled and where the trust boundaries are, see [docs/security-posture.md](docs/security-posture.md).
