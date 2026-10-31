
 // @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/pages/settings-page';
import type { DeviceConfig } from '../src/types';
import { getDeviceConfig, setDeviceConfig } from '../src/api';

vi.mock('../src/api', async (original) => ({
  ...await original<typeof import('../src/api')>(),
  getDeviceConfig: vi.fn(),
  setDeviceConfig: vi.fn(),
}));

type TestPage = HTMLElement & {
  updateComplete: Promise<boolean>;
  _deviceConfig: DeviceConfig | null;
  _loading: boolean;
  _editValues: Record<string, unknown>;
  hass: unknown;
  config: { entry_id: string };
  _loadDeviceConfig: () => Promise<void>;
  _handleApply: (section: string) => Promise<void>;
};

let page: TestPage;

afterEach(() => {
  page?.remove();
  vi.resetAllMocks();
});

async function mount(mode: number | null | undefined) {
  page = document.createElement('meshcore-settings-page') as unknown as TestPage;

  page._deviceConfig = {
    name: 'H_01',
    firmware_version: '1.17.1',
    hardware_model: 'LILYGO',
    pubkey: 'test',
    max_channels: 8,
    path_hash_mode: mode,
  };

  page._loading = false;
  document.body.appendChild(page);
  await page.updateComplete;

  const label = Array.from(
    page.shadowRoot!.querySelectorAll('label')
  ).find(el => el.textContent?.trim() === 'Path Hash Mode');

  const select = label?.parentElement?.querySelector('select');
  expect(select).toBeTruthy();

  return select as HTMLSelectElement;
}

describe('Path Hash Mode', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [2, '2'],
    [null, ''],
    [undefined, ''],
  ])('selects correct option for mode %s', async (mode, expected) => {
    const select = await mount(mode);

    const selected = select.querySelectorAll('option[selected]');

    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute('value')).toBe(expected);

    if (mode === null || mode === undefined) {
      expect(selected[0]?.textContent?.trim()).toBe(
        'Unknown (unavailable)'
      );
    }
  });

  it('does not invent a value when mode is unknown', async () => {
    const select = await mount(null);

    expect(page._editValues['path_hash_mode']).toBeUndefined();

    const apply = Array.from(
      page.shadowRoot!.querySelectorAll('button')
    ).find(b => b.textContent?.includes('Apply Radio Settings'));

    expect(apply?.disabled).toBe(true);

    select.value = '1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await page.updateComplete;

    expect(page._editValues['path_hash_mode']).toBe(1);
    expect(apply?.disabled).toBe(false);
  });

  it('saves only explicit edits to the selected radio', async () => {
    await mount(null);
    page.hass = { callWS: vi.fn().mockResolvedValue([]) };
    vi.mocked(getDeviceConfig).mockResolvedValue(page._deviceConfig!);
    page.config = { entry_id: 'b' };
    await page.updateComplete;
    await Promise.resolve();
    page._editValues = { tx_power: 17 };
    vi.mocked(setDeviceConfig).mockResolvedValue({ success: true });
    await page._handleApply('radio-settings');
    expect(setDeviceConfig).toHaveBeenLastCalledWith(page.hass, { tx_power: 17 }, 'b');
    page._editValues = { path_hash_mode: 2 };
    await page._handleApply('radio-settings');
    expect(setDeviceConfig).toHaveBeenLastCalledWith(page.hass, { path_hash_mode: 2 }, 'b');
  });

  it('ignores a late read from the previous radio', async () => {
    await mount(0);
    const pending = new Map<string, (config: DeviceConfig) => void>();
    vi.mocked(getDeviceConfig).mockImplementation((_hass, entry) => new Promise(resolve => pending.set(entry!, resolve)));
    page.hass = { callWS: vi.fn().mockResolvedValue([]) };
    page.config = { entry_id: 'a' };
    await page.updateComplete;
    page._editValues = { path_hash_mode: 2 };
    page.config = { entry_id: 'b' };
    await page.updateComplete;
    expect([...pending.keys()]).toEqual(['a', 'b']);
    pending.get('b')!({ name: 'B', path_hash_mode: 1 });
    await Promise.resolve();
    await page.updateComplete;
    pending.get('a')!({ name: 'A', path_hash_mode: 0 });
    await Promise.resolve();
    await page.updateComplete;
    expect(page._deviceConfig?.name).toBe('B');
    expect(page._editValues).toEqual({});
  });

  it('does not apply a late save result to another radio', async () => {
    await mount(0);
    page.hass = { callWS: vi.fn().mockResolvedValue([]) };
    vi.mocked(getDeviceConfig).mockResolvedValue({ name: 'A', path_hash_mode: 0 });
    page.config = { entry_id: 'a' };
    await page.updateComplete;
    await Promise.resolve();
    let finish!: (result: { success: boolean }) => void;
    vi.mocked(setDeviceConfig).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    page._editValues = { path_hash_mode: 2 };
    const saving = page._handleApply('radio-settings');
    expect(setDeviceConfig).toHaveBeenCalledWith(page.hass, { path_hash_mode: 2 }, 'a');
    vi.mocked(getDeviceConfig).mockResolvedValue({ name: 'B', path_hash_mode: 1 });
    page.config = { entry_id: 'b' };
    await page.updateComplete;
    await Promise.resolve();
    finish({ success: true });
    await saving;
    expect(page._deviceConfig?.path_hash_mode).toBe(1);
    expect(page._editValues).toEqual({});
  });
});
