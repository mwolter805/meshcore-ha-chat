// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { html, render } from 'lit';

// Mock the api module — channel-dialog imports setChannel and
// getFloodScopes from '../src/api'. The scope allowlist each test
// wants is set via mockGetFloodScopes.mockResolvedValue(...).
// Rest params on the impls so the `(...args) => mock(...args)` forwarders
// below spread into a rest parameter (otherwise tsc TS2556 on a fixed-arity
// mock). The forwarder indirection is required: vi.mock's factory is hoisted
// above these declarations, so it can't reference the mocks except lazily.
const mockSetChannel = vi.fn(async (..._args: unknown[]) => ({ success: true }));
const mockGetFloodScopes = vi.fn(
  async (..._args: unknown[]): Promise<FloodScopes> => ({ scopes: [], global: false }),
);
vi.mock('../src/api', () => ({
  setChannel: (...args: unknown[]) => mockSetChannel(...args),
  getFloodScopes: (...args: unknown[]) => mockGetFloodScopes(...args),
}));

// Import AFTER vi.mock so the component resolves the mocked module.
import '../src/components/channel-dialog';
import type { ChannelDialog } from '../src/components/channel-dialog';
import type { FloodScopes, HomeAssistant } from '../src/types';
import { sha256 } from '../src/chat/message-parser';

const fakeHass = { callWS: vi.fn(), callService: vi.fn() } as unknown as HomeAssistant;

let containers: HTMLElement[] = [];

async function mountDialog(opts: {
  editMode?: boolean;
  initialScope?: string;
  initialChannelName?: string;
  initialKey?: string;
} = {}): Promise<ChannelDialog> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);

  render(
    html`
      <meshcore-channel-dialog
        .open=${true}
        .hass=${fakeHass}
        .entryId=${'test-entry'}
        .editMode=${opts.editMode ?? false}
        .initialChannelIdx=${0}
        .initialChannelName=${opts.initialChannelName ?? ''}
        .initialScope=${opts.initialScope ?? ''}
        .initialKey=${opts.initialKey ?? ''}
        .availableIndices=${[0, 1, 2]}
      ></meshcore-channel-dialog>
    `,
    container,
  );

  const dialog = container.querySelector('meshcore-channel-dialog') as ChannelDialog;
  await dialog.updateComplete;
  // Drain the async allowlist fetch kicked off by the dialog opening,
  // then the re-render it triggers.
  await Promise.resolve();
  await dialog.updateComplete;
  return dialog;
}

function scopeSelect(dialog: ChannelDialog): HTMLSelectElement {
  const el = dialog.shadowRoot!.querySelector('.scope-select');
  expect(el, 'scope select should render').not.toBeNull();
  return el as HTMLSelectElement;
}

function optionLabels(select: HTMLSelectElement): string[] {
  return Array.from(select.querySelectorAll('option')).map((o) => o.textContent?.trim() ?? '');
}

beforeEach(() => {
  mockSetChannel.mockClear();
  mockGetFloodScopes.mockClear();
  mockGetFloodScopes.mockResolvedValue({ scopes: [], global: false });
});

afterEach(() => {
  containers.forEach((c) => c.remove());
  containers = [];
});

describe('channel-dialog region scope field', () => {
  it('renders the allowlist as options with "All regions" first', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['waw', 'pl-mz'], global: false });
    const dialog = await mountDialog();

    const labels = optionLabels(scopeSelect(dialog));
    expect(labels[0]).toBe('All regions (global flood)');
    expect(labels).toContain('waw');
    expect(labels).toContain('pl-mz');
    expect(scopeSelect(dialog).disabled).toBe(false);
  });

  it('disables the select and shows the setup hint when the allowlist is empty', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: [], global: false });
    const dialog = await mountDialog();

    expect(scopeSelect(dialog).disabled).toBe(true);
    const hint = dialog.shadowRoot!.querySelector('.scope-empty-hint');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('Flood Scope Allowlist');
    const link = hint!.querySelector('a');
    expect(link!.getAttribute('href')).toBe('/config/integrations/integration/meshcore');
  });

  it('preselects the channel scope in edit mode', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['waw', 'pl-mz'], global: false });
    const dialog = await mountDialog({
      editMode: true,
      initialChannelName: 'general',
      initialScope: 'pl-mz',
    });

    // Assert on the selected attribute the component controls —
    // happy-dom's select.value derivation from attribute-marked
    // options is unreliable, but the attribute placement is exactly
    // what the template renders.
    const marked = scopeSelect(dialog).querySelector('option[selected]');
    expect(marked?.getAttribute('value')).toBe('pl-mz');
  });

  it('keeps a persisted scope selectable when it is no longer in the allowlist', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['den'], global: false });
    const dialog = await mountDialog({
      editMode: true,
      initialChannelName: 'general',
      initialScope: 'waw',
    });

    const select = scopeSelect(dialog);
    expect(select.disabled).toBe(false);
    expect(optionLabels(select)).toContain('waw (not in allowlist)');
    const marked = select.querySelector('option[selected]');
    expect(marked?.getAttribute('value')).toBe('waw');
  });

  it('passes the chosen scope to setChannel on save', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['waw'], global: false });
    const dialog = await mountDialog();

    // Fill the name, pick the scope, save.
    const nameInput = dialog.shadowRoot!.querySelector('.form-input') as HTMLInputElement;
    nameInput.value = 'general';
    nameInput.dispatchEvent(new Event('input'));
    await dialog.updateComplete;

    const select = scopeSelect(dialog);
    select.value = 'waw';
    select.dispatchEvent(new Event('change'));
    await dialog.updateComplete;

    const save = dialog.shadowRoot!.querySelector('.dialog-button.primary') as HTMLButtonElement;
    save.click();
    await dialog.updateComplete;

    expect(mockSetChannel).toHaveBeenCalledWith(
      fakeHass, 0, 'general', undefined, 'test-entry', 'waw',
    );
  });

  it('sends an empty scope on save when the global row is selected and "*" is not allowlisted', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['waw'], global: false });
    const dialog = await mountDialog({
      editMode: true,
      initialChannelName: 'general',
      initialScope: 'waw',
    });

    const select = scopeSelect(dialog);
    select.value = '';
    select.dispatchEvent(new Event('change'));
    await dialog.updateComplete;

    const save = dialog.shadowRoot!.querySelector('.dialog-button.primary') as HTMLButtonElement;
    save.click();
    await dialog.updateComplete;

    expect(mockSetChannel).toHaveBeenCalledWith(
      fakeHass, 0, 'general', undefined, 'test-entry', '',
    );
  });

  it('renders "All regions (global flood)" and persists "*" when the wildcard is allowlisted', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['pl-mz'], global: true });
    const dialog = await mountDialog();

    const select = scopeSelect(dialog);
    const labels = optionLabels(select);
    expect(labels[0]).toBe('All regions (global flood)');
    expect(labels).toContain('pl-mz');
    // When "*" is allowlisted the global row carries the wildcard value,
    // so selecting it persists "*" rather than an empty string.
    const globalOption = select.querySelector('option') as HTMLOptionElement;
    expect(globalOption.getAttribute('value')).toBe('*');

    const nameInput = dialog.shadowRoot!.querySelector('.form-input') as HTMLInputElement;
    nameInput.value = 'general';
    nameInput.dispatchEvent(new Event('input'));
    await dialog.updateComplete;

    select.value = '*';
    select.dispatchEvent(new Event('change'));
    await dialog.updateComplete;

    const save = dialog.shadowRoot!.querySelector('.dialog-button.primary') as HTMLButtonElement;
    save.click();
    await dialog.updateComplete;

    expect(mockSetChannel).toHaveBeenCalledWith(
      fakeHass, 0, 'general', undefined, 'test-entry', '*',
    );
  });

  it('maps a persisted "*" to the All-regions row, not an orphan row', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['pl-mz'], global: true });
    const dialog = await mountDialog({
      editMode: true,
      initialChannelName: 'general',
      initialScope: '*',
    });

    const select = scopeSelect(dialog);
    // The wildcard must NOT render as an orphaned "(not in allowlist)" row.
    expect(optionLabels(select)).not.toContain('* (not in allowlist)');
    // It is represented by the canonical All-regions row, selected, value "*".
    const marked = select.querySelector('option[selected]') as HTMLOptionElement;
    expect(marked?.textContent?.trim()).toBe('All regions (global flood)');
    expect(marked?.getAttribute('value')).toBe('*');
  });

  it('re-fetches the allowlist on every open', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['waw'], global: false });
    const dialog = await mountDialog();
    expect(mockGetFloodScopes).toHaveBeenCalledTimes(1);

    // Close and reopen — the upstream allowlist may have changed.
    dialog.open = false;
    await dialog.updateComplete;
    dialog.open = true;
    await dialog.updateComplete;
    await Promise.resolve();
    await dialog.updateComplete;

    expect(mockGetFloodScopes).toHaveBeenCalledTimes(2);
  });

  it('preserves a custom key when editing (does not regenerate on save)', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['waw'], global: false });
    const customKey = '00112233445566778899aabbccddeeff'; // not SHA256("general")[:16]
    const dialog = await mountDialog({
      editMode: true,
      initialChannelName: 'general',
      initialScope: 'waw',
      initialKey: customKey,
    });

    // Auto-key is OFF and the custom key is loaded into the hex field.
    const toggle = dialog.shadowRoot!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.hasAttribute('checked')).toBe(false);
    const hexInput = dialog.shadowRoot!.querySelector('.hex-input') as HTMLInputElement;
    expect(hexInput).not.toBeNull();
    expect(hexInput.value).toBe(customKey);

    // Save without touching the key → setChannel gets the existing custom key,
    // NOT undefined (which would silently regenerate it as the auto-key).
    const save = dialog.shadowRoot!.querySelector('.dialog-button.primary') as HTMLButtonElement;
    save.click();
    await dialog.updateComplete;

    expect(mockSetChannel).toHaveBeenCalledWith(
      fakeHass, 0, 'general', customKey, 'test-entry', 'waw',
    );
  });

  it('keeps auto-key for an auto-keyed channel on edit', async () => {
    mockGetFloodScopes.mockResolvedValue({ scopes: ['waw'], global: false });
    const autoKey = sha256('general').slice(0, 32); // the SDK auto-key for "general"
    const dialog = await mountDialog({
      editMode: true,
      initialChannelName: 'general',
      initialScope: 'waw',
      initialKey: autoKey,
    });

    const toggle = dialog.shadowRoot!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(toggle.hasAttribute('checked')).toBe(true);

    const save = dialog.shadowRoot!.querySelector('.dialog-button.primary') as HTMLButtonElement;
    save.click();
    await dialog.updateComplete;

    // Auto-keyed → key arg undefined, so the backend re-derives the same key.
    expect(mockSetChannel).toHaveBeenCalledWith(
      fakeHass, 0, 'general', undefined, 'test-entry', 'waw',
    );
  });
});
