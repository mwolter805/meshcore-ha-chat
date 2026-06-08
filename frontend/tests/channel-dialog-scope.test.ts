// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { html, render } from 'lit';

// Mock the api module — channel-dialog imports setChannel and
// getFloodScopes from '../src/api'. The scope allowlist each test
// wants is set via mockGetFloodScopes.mockResolvedValue(...).
const mockSetChannel = vi.fn(async () => ({ success: true }));
const mockGetFloodScopes = vi.fn(async (): Promise<string[]> => []);
vi.mock('../src/api', () => ({
  setChannel: (...args: unknown[]) => mockSetChannel(...args),
  getFloodScopes: (...args: unknown[]) => mockGetFloodScopes(...args),
}));

// Import AFTER vi.mock so the component resolves the mocked module.
import '../src/components/channel-dialog';
import type { ChannelDialog } from '../src/components/channel-dialog';
import type { HomeAssistant } from '../src/types';

const fakeHass = { callWS: vi.fn(), callService: vi.fn() } as unknown as HomeAssistant;

let containers: HTMLElement[] = [];

async function mountDialog(opts: {
  editMode?: boolean;
  initialScope?: string;
  initialChannelName?: string;
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
  mockGetFloodScopes.mockResolvedValue([]);
});

afterEach(() => {
  containers.forEach((c) => c.remove());
  containers = [];
});

describe('channel-dialog region scope field', () => {
  it('renders the allowlist as options with "No scope" first', async () => {
    mockGetFloodScopes.mockResolvedValue(['waw', 'pl-mz']);
    const dialog = await mountDialog();

    const labels = optionLabels(scopeSelect(dialog));
    expect(labels[0]).toBe('No scope (global flood)');
    expect(labels).toContain('waw');
    expect(labels).toContain('pl-mz');
    expect(scopeSelect(dialog).disabled).toBe(false);
  });

  it('disables the select and shows the setup hint when the allowlist is empty', async () => {
    mockGetFloodScopes.mockResolvedValue([]);
    const dialog = await mountDialog();

    expect(scopeSelect(dialog).disabled).toBe(true);
    const hint = dialog.shadowRoot!.querySelector('.scope-empty-hint');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('Flood Scope Allowlist');
    const link = hint!.querySelector('a');
    expect(link!.getAttribute('href')).toBe('/config/integrations/integration/meshcore');
  });

  it('preselects the channel scope in edit mode', async () => {
    mockGetFloodScopes.mockResolvedValue(['waw', 'pl-mz']);
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
    mockGetFloodScopes.mockResolvedValue(['den']);
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
    mockGetFloodScopes.mockResolvedValue(['waw']);
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

  it('sends an empty scope on save when "No scope" is selected (clears persisted scope)', async () => {
    mockGetFloodScopes.mockResolvedValue(['waw']);
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

  it('re-fetches the allowlist on every open', async () => {
    mockGetFloodScopes.mockResolvedValue(['waw']);
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
});
