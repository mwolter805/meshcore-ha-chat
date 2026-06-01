// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';

import '../src/components/message-rate-chart';
import type { RatePoint } from '../src/components/message-rate-chart';

type Chart = HTMLElement & {
  data?: RatePoint[];
  updateComplete: Promise<boolean>;
  // private members poked at in tests (happy-dom has no real layout, so we
  // drive the hover state directly rather than dispatching pointer events)
  _hoverIndex: number | null;
  _nearestBucket: (svgX: number) => number;
  _onPointerLeave: (e: PointerEvent) => void;
  requestUpdate: () => void;
};

async function mount(data: RatePoint[]): Promise<Chart> {
  const el = document.createElement('meshcore-message-rate-chart') as unknown as Chart;
  el.data = data;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe('message-rate-chart', () => {
  let el: Chart | undefined;
  afterEach(() => el?.remove());

  it('renders nothing when there is no data', async () => {
    el = await mount([]);
    expect(el.shadowRoot?.querySelector('svg')).toBeNull();
    expect(el.shadowRoot?.querySelector('.chart-container')).toBeNull();
  });

  it('draws an svg + the five-series legend when given data', async () => {
    const now = Date.now();
    el = await mount([
      { timestamp: now - 3_600_000, values: { sent_flood: 1.2, sent_direct: 0.3, recv_flood: 3.4, recv_direct: 0.5, errors: 0.1 } },
      { timestamp: now, values: { sent_flood: 0.8, sent_direct: 0.2, recv_flood: 2.1, recv_direct: 0.4, errors: 0 } },
    ]);
    expect(el.shadowRoot?.querySelector('svg')).toBeTruthy();
    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('Sent · Flood');
    expect(text).toContain('Sent · Direct');
    expect(text).toContain('Recv · Flood');
    expect(text).toContain('Recv · Direct');
    expect(text).toContain('Errors');
    expect(text).toContain('msg/min');
    const polylines = Array.from(el.shadowRoot?.querySelectorAll('polyline') ?? []);
    expect(polylines.length).toBeGreaterThanOrEqual(5);
    // The two "direct" series render dashed.
    const dashed = polylines.filter((p) => (p.getAttribute('stroke-dasharray') ?? 'none') !== 'none');
    expect(dashed.length).toBeGreaterThanOrEqual(2);
  });

  it('renders a single datapoint as a dot rather than a line', async () => {
    el = await mount([{ timestamp: Date.now(), values: { sent_flood: 5, recv_flood: 0, errors: 0 } }]);
    expect(el.shadowRoot?.querySelector('circle')).toBeTruthy();
  });

  it('shows no tooltip until a bucket is active', async () => {
    el = await mount([
      { timestamp: Date.now() - 3_600_000, values: { sent_flood: 1, recv_flood: 2, errors: 0 } },
      { timestamp: Date.now(), values: { sent_flood: 1, recv_flood: 2, errors: 0 } },
    ]);
    expect(el.shadowRoot?.querySelector('.tooltip')).toBeNull();
  });

  it('renders a tooltip with the time and all five series for the active bucket', async () => {
    const ts = Date.now();
    el = await mount([
      { timestamp: ts - 3_600_000, values: { sent_flood: 1.4, sent_direct: 0.3, recv_flood: 3.44, recv_direct: 0.5, errors: 0.1 } },
      { timestamp: ts, values: { sent_flood: 0.84, sent_direct: 0.2, recv_flood: 2.1, recv_direct: 0.4, errors: 0 } },
    ]);

    el._hoverIndex = 0;
    el.requestUpdate();
    await el.updateComplete;

    const tip = el.shadowRoot?.querySelector('.tooltip');
    expect(tip).toBeTruthy();
    const rows = tip?.querySelectorAll('.tt-row') ?? [];
    expect(rows.length).toBe(5); // all five series, including zero/absent

    const text = tip?.textContent ?? '';
    expect(text).toContain('Sent · Flood');
    expect(text).toContain('Sent · Direct');
    expect(text).toContain('Recv · Flood');
    expect(text).toContain('Recv · Direct');
    expect(text).toContain('Errors');
    // bucket-0 values, formatted (<1 → 2dp, ≥1 → 1dp, 0 → "0")
    expect(text).toContain('1.4');   // sent_flood 1.4 → "1.4"
    expect(text).toContain('0.30');  // sent_direct 0.3 → "0.30"
    expect(text).toContain('msg/min');

    // A crosshair guide + per-series dots appear on the chart.
    const circles = el.shadowRoot?.querySelectorAll('circle') ?? [];
    expect(circles.length).toBeGreaterThanOrEqual(5);
  });

  it('shows an em dash for a series with no datum in the active bucket', async () => {
    const ts = Date.now();
    el = await mount([
      { timestamp: ts, values: { sent_flood: 1, recv_flood: 2, errors: 0 } }, // no *_direct keys
    ]);
    el._hoverIndex = 0;
    el.requestUpdate();
    await el.updateComplete;
    const text = el.shadowRoot?.querySelector('.tooltip')?.textContent ?? '';
    expect(text).toContain('—');
  });

  it('keeps the tooltip open when a touch pointer leaves, dismisses on mouse-out', async () => {
    const ts = Date.now();
    el = await mount([
      { timestamp: ts - 3_600_000, values: { sent_flood: 1 } },
      { timestamp: ts, values: { sent_flood: 1 } },
    ]);
    el._hoverIndex = 1;

    // A touch tap fires pointerleave the instant the finger lifts — must NOT close.
    el._onPointerLeave({ pointerType: 'touch' } as PointerEvent);
    expect(el._hoverIndex).toBe(1);

    // Mouse leaving the chart still dismisses (desktop hover behavior).
    el._onPointerLeave({ pointerType: 'mouse' } as PointerEvent);
    expect(el._hoverIndex).toBeNull();
  });

  it('_nearestBucket snaps to the closest point by x', async () => {
    const ts = Date.now();
    el = await mount([
      { timestamp: ts - 47 * 3_600_000, values: { sent_flood: 1 } },
      { timestamp: ts - 24 * 3_600_000, values: { sent_flood: 1 } },
      { timestamp: ts, values: { sent_flood: 1 } },
    ]);
    expect(el._nearestBucket(-9999)).toBe(0); // far left → oldest
    expect(el._nearestBucket(9999)).toBe(2);  // far right → newest
  });
});
