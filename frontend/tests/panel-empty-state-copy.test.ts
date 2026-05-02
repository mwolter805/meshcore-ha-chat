// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import '../src/meshcore-chat-panel';

// Phase 1 of the runtime-removal-detection proposal sharpens the
// panel's empty-state copy: when the discovery path returns zero
// devices (meaning the upstream meshcore integration is most likely
// missing or unconfigured), the panel points the user at the Repairs
// UI where the upstream_meshcore_unavailable issue carries the actual
// remediation copy. Other error strings (e.g. "Failed to load: ...")
// keep the legacy generic copy.

afterEach(() => {
  document.body.innerHTML = '';
});

async function mountPanelWithError(error: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  container.innerHTML = '<meshcore-chat-panel></meshcore-chat-panel>';
  const panel = container.querySelector('meshcore-chat-panel') as
    | (HTMLElement & {
        updateComplete: Promise<unknown>;
        requestUpdate: () => void;
      })
    | null;
  if (!panel) throw new Error('panel element not mounted');
  // Wait for first connect/render pass so the spinner branch resolves.
  await panel.updateComplete;
  // Drive the panel into the empty-state branch:
  //   _loading = false  → past the spinner branch
  //   _loadingStarted = true → _loadData early-returns if re-entered
  //   _error / _config drive the empty-state branch in render()
  // The @state props are private in TS but accessible at runtime; cast
  // to any so the test stays readable.
  const p = panel as unknown as Record<string, unknown>;
  p._loading = false;
  p._loadingStarted = true;
  p._error = error;
  p._config = null;
  panel.requestUpdate();
  await panel.updateComplete;
  return panel;
}

describe('meshcore-chat-panel empty-state copy (Phase 1)', () => {
  it('renders Repairs + Devices&Services links when error is "No MeshCore devices found"', async () => {
    const panel = await mountPanelWithError('No MeshCore devices found');
    const root = panel.shadowRoot;
    expect(root).not.toBeNull();
    const text = root?.textContent ?? '';
    expect(text).toContain('No MeshCore devices found');
    // The new conditional copy points at the Repairs UI.
    const repairsLink = root?.querySelector('a[href="/config/repairs"]');
    expect(repairsLink, 'Repairs link should be rendered').not.toBeNull();
    const integrationsLink = root?.querySelector(
      'a[href="/config/integrations"]',
    );
    expect(
      integrationsLink,
      'Devices & Services link should be rendered',
    ).not.toBeNull();
    // The legacy generic copy is replaced for this error path.
    expect(text).not.toContain(
      'Check that the MeshCore integration is loaded and connected.',
    );
  });

  it('keeps the legacy generic copy for other error strings', async () => {
    const panel = await mountPanelWithError('Failed to load: network down');
    const root = panel.shadowRoot;
    expect(root).not.toBeNull();
    const text = root?.textContent ?? '';
    expect(text).toContain('Failed to load: network down');
    // No Repairs link on non-empty-state errors.
    expect(root?.querySelector('a[href="/config/repairs"]')).toBeNull();
    expect(root?.querySelector('a[href="/config/integrations"]')).toBeNull();
    // Legacy copy remains.
    expect(text).toContain(
      'Check that the MeshCore integration is loaded and connected.',
    );
  });
});
