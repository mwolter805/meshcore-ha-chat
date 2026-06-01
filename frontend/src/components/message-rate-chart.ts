import { LitElement, html, css, svg, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/** One time bucket: { timestamp, values: { sent, recv, errors } } in msg/min. */
export interface RatePoint {
  timestamp: number;
  values: Record<string, number>;
}

// Five series. Colour groups the family (Sent = blue, Received = green,
// Errors = red); line style distinguishes route within a family
// (Flood = solid, Direct = dashed).
const SERIES: Array<{ key: string; label: string; color: string; dash: boolean }> = [
  { key: 'sent_flood',  label: 'Sent · Flood',  color: 'var(--info, #2196f3)', dash: false },
  { key: 'sent_direct', label: 'Sent · Direct', color: 'var(--info, #2196f3)', dash: true },
  { key: 'recv_flood',  label: 'Recv · Flood',  color: 'var(--good, #4caf50)', dash: false },
  { key: 'recv_direct', label: 'Recv · Direct', color: 'var(--good, #4caf50)', dash: true },
  { key: 'errors',      label: 'Errors',        color: 'var(--bad, #f44336)',  dash: false },
];

/** Geometry + scales shared by the renderer and the pointer hit-test. */
interface Geom {
  padL: number; padR: number; padT: number; padB: number;
  w: number; h: number; cw: number; ch: number; maxV: number;
  now: number; range: number; oldest: number;
  xScale: (ts: number) => number;
  yScale: (v: number) => number;
}

/**
 * Compact multi-line SVG chart of message rates (msg/min) over a time window.
 * Five fixed series — Sent/Recv split into Flood/Direct, plus Errors — sharing
 * one Y-axis (all are msg/min). Mirrors the lightweight, dependency-free
 * approach of snr-chart. Renders nothing when handed no data (the caller
 * decides whether to fetch). Hovering (mouse) or tapping (touch) a column
 * snaps to the nearest hourly bucket and shows a tooltip with its timestamp
 * and every series value.
 */
@customElement('meshcore-message-rate-chart')
export class MessageRateChart extends LitElement {
  @property({ type: Array }) data: RatePoint[] = [];
  @property({ type: Number }) width = 700;
  @property({ type: Number }) height = 170;
  @property({ type: Number }) timeRange = 48; // hours

  /** Index into `data` of the bucket currently under the pointer, or null. */
  @state() private _hoverIndex: number | null = null;

  static styles = css`
    :host { display: block; width: 100%; }
    svg { width: 100%; height: auto; display: block; touch-action: pan-y; }
    .chart-container {
      width: 100%;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      background: var(--input-bg);
      padding: 10px 12px;
      box-sizing: border-box;
    }
    /* Shrink-wraps the SVG so the tooltip can be positioned in % of the SVG
       box — percentages map exactly because the SVG fills this wrapper, with
       no dependence on the rendered scale factor. */
    .plot { position: relative; }
    .tooltip {
      position: absolute;
      top: 4px;
      z-index: 2;
      pointer-events: none;
      background: var(--card-background-color, var(--input-bg, #fff));
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 11px;
      color: var(--primary-text-color, #212121);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      white-space: nowrap;
    }
    .tt-head {
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--secondary-text-color, #727272);
    }
    .tt-row { display: flex; align-items: center; gap: 6px; line-height: 1.5; }
    .tt-row .sw {
      display: inline-block;
      width: 12px;
      height: 0;
      border-top: 2px solid;
      flex-shrink: 0;
    }
    .tt-row .sw.dashed { border-top-style: dashed; }
    .tt-row .lbl { flex: 1; padding-right: 8px; }
    .tt-row .val { font-variant-numeric: tabular-nums; text-align: right; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 6px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .legend-line {
      display: inline-block;
      width: 16px;
      height: 0;
      border-top: 2px solid;
      flex-shrink: 0;
    }
    .legend-line.dashed { border-top-style: dashed; }
  `;

  render() {
    if (!this.data || this.data.length === 0) return nothing;
    return html`
      <div class="chart-container">
        <div class="plot">
          ${this._renderChart()}
          ${this._hoverIndex != null ? this._renderTooltip() : nothing}
        </div>
        <div class="legend">
          ${SERIES.map(
            (s) => html`<div class="legend-item">
              <span class="legend-line ${s.dash ? 'dashed' : ''}"
                    style="border-top-color:${s.color}"></span>${s.label}
            </div>`,
          )}
        </div>
      </div>
    `;
  }

  private _timeLabel(ts: number, now: number): string {
    const h = Math.round((now - ts) / 3_600_000);
    return h <= 0 ? 'now' : `-${h}h`;
  }

  /** Format a msg/min value for the tooltip; '—' when the bucket has no datum. */
  private _fmtValue(v: number | undefined): string {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    if (v === 0) return '0';
    return v < 1 ? v.toFixed(2) : v.toFixed(1);
  }

  /** Geometry + scales; recomputed per render so width/height/data changes apply. */
  private _geom(): Geom {
    const padL = 40, padR = 12, padT = 12, padB = 22;
    const w = this.width, h = this.height;
    const cw = w - padL - padR;
    const ch = h - padT - padB;

    let maxV = 0;
    for (const p of this.data) {
      for (const s of SERIES) {
        const v = p.values[s.key];
        if (typeof v === 'number' && isFinite(v)) maxV = Math.max(maxV, v);
      }
    }
    if (maxV <= 0) maxV = 1;

    const now = Date.now();
    const range = this.timeRange * 3_600_000;
    const oldest = now - range;
    const xScale = (ts: number) => padL + ((ts - oldest) / range) * cw;
    const yScale = (v: number) => padT + ch - (v / maxV) * ch;
    return { padL, padR, padT, padB, w, h, cw, ch, maxV, now, range, oldest, xScale, yScale };
  }

  /** Nearest data-point index to an x coordinate in SVG user units. */
  private _nearestBucket(svgX: number): number {
    const { xScale } = this._geom();
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.data.length; i++) {
      const d = Math.abs(xScale(this.data[i].timestamp) - svgX);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Map a pointer event to a bucket index (null if it can't be measured). */
  private _indexFromEvent(e: PointerEvent): number | null {
    const svgEl = this.renderRoot.querySelector('svg');
    if (!svgEl || this.data.length === 0) return null;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width === 0) return null; // not laid out yet (e.g. happy-dom)
    const svgX = ((e.clientX - rect.left) / rect.width) * this.width;
    return this._nearestBucket(svgX);
  }

  private _onPointerMove = (e: PointerEvent) => {
    const idx = this._indexFromEvent(e);
    if (idx != null && idx !== this._hoverIndex) this._hoverIndex = idx;
  };

  // Tap toggles: tapping the active column dismisses it, tapping another moves it.
  private _onPointerDown = (e: PointerEvent) => {
    const idx = this._indexFromEvent(e);
    if (idx == null) return;
    this._hoverIndex = idx === this._hoverIndex ? null : idx;
  };

  private _onPointerLeave = (e: PointerEvent) => {
    // On touch, pointerleave fires the instant the finger lifts, which would
    // close the tooltip on a normal tap. Dismiss only on mouse-out; a touch
    // tap leaves the tooltip open until the user taps the same column again
    // (toggle) or taps another column.
    if (e.pointerType === 'mouse') this._hoverIndex = null;
  };

  private _renderChart() {
    const g = this._geom();
    const { padL, padR, padT, padB, w, h, ch, maxV, now, range, oldest, xScale, yScale } = g;

    const grid = [0, maxV / 2, maxV].map((v) => {
      const y = yScale(v);
      return svg`
        <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}"
          stroke="var(--divider-color,#e0e0e0)" stroke-dasharray="4,4" opacity="0.3" />
        <text x="${padL - 6}" y="${y + 3}" font-size="9" text-anchor="end"
          fill="var(--secondary-text-color,#727272)">${v < 1 ? v.toFixed(1) : Math.round(v)}</text>`;
    });

    const xLabels = [oldest, oldest + range / 2, now].map(
      (ts) => svg`
        <text x="${xScale(ts)}" y="${h - padB + 14}" font-size="9" text-anchor="middle"
          fill="var(--secondary-text-color,#727272)">${this._timeLabel(ts, now)}</text>`,
    );

    const lines = SERIES.map((s) => {
      const pts = this.data
        .filter((p) => typeof p.values[s.key] === 'number' && isFinite(p.values[s.key]))
        .map((p) => `${xScale(p.timestamp).toFixed(1)},${yScale(p.values[s.key]).toFixed(1)}`);
      if (pts.length === 0) return svg``;
      if (pts.length === 1) {
        const [x, y] = pts[0].split(',');
        return svg`<circle cx="${x}" cy="${y}" r="2" fill="${s.color}" />`;
      }
      return svg`<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}"
        stroke-width="1.5" stroke-dasharray="${s.dash ? '5,3' : 'none'}"
        stroke-linecap="round" stroke-linejoin="round" />`;
    });

    // Hover crosshair + per-series markers for the active bucket.
    let hover = svg``;
    if (this._hoverIndex != null && this._hoverIndex < this.data.length) {
      const hp = this.data[this._hoverIndex];
      const hx = xScale(hp.timestamp);
      const dots = SERIES.map((s) => {
        const v = hp.values[s.key];
        if (typeof v !== 'number' || !isFinite(v)) return svg``;
        return svg`<circle cx="${hx}" cy="${yScale(v)}" r="3" fill="${s.color}"
          stroke="var(--card-background-color,#fff)" stroke-width="1" />`;
      });
      hover = svg`
        <line x1="${hx}" y1="${padT}" x2="${hx}" y2="${h - padB}"
          stroke="var(--primary-text-color,#888)" stroke-width="1" opacity="0.35" />
        ${dots}`;
    }

    return svg`
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Message rate over the last ${this.timeRange} hours"
           @pointermove="${this._onPointerMove}"
           @pointerdown="${this._onPointerDown}"
           @pointerleave="${this._onPointerLeave}">
        ${grid}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}"
          stroke="var(--divider-color,#e0e0e0)" stroke-width="1" />
        <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}"
          stroke="var(--divider-color,#e0e0e0)" stroke-width="1" />
        ${lines}
        ${hover}
        ${xLabels}
        <text x="${padL}" y="${padT - 2}" font-size="9"
          fill="var(--secondary-text-color,#727272)">msg/min</text>
        <rect x="${padL}" y="${padT}" width="${g.cw}" height="${ch}"
          fill="transparent" style="pointer-events:all" />
      </svg>`;
  }

  private _renderTooltip() {
    const idx = this._hoverIndex;
    if (idx == null || idx >= this.data.length) return nothing;
    const g = this._geom();
    const hp = this.data[idx];
    const pctX = (g.xScale(hp.timestamp) / g.w) * 100;
    const rightAlign = pctX > 55;
    const d = new Date(hp.timestamp);
    const head = d.toLocaleString([], {
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
    // Anchor at the column; nudge left/right so the box stays on-chart.
    const style = rightAlign
      ? `left:${pctX}%; transform:translateX(calc(-100% - 8px));`
      : `left:${pctX}%; transform:translateX(8px);`;
    return html`
      <div class="tooltip" style="${style}">
        <div class="tt-head">${head} · msg/min</div>
        ${SERIES.map(
          (s) => html`<div class="tt-row">
            <span class="sw ${s.dash ? 'dashed' : ''}" style="border-top-color:${s.color}"></span>
            <span class="lbl">${s.label}</span>
            <span class="val">${this._fmtValue(hp.values[s.key])}</span>
          </div>`,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-message-rate-chart': MessageRateChart;
  }
}
