
 // @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import '../src/pages/settings-page';
import type { DeviceConfig } from '../src/types';

type TestPage = HTMLElement & {
  updateComplete: Promise<boolean>;
  _deviceConfig: DeviceConfig | null;
  _loading: boolean;
  _editValues: Record<string, unknown>;
};

let page: TestPage;

afterEach(() => {
  page?.remove();
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
});
