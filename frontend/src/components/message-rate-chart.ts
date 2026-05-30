import { LitElement, html, css, svg, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

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

/**
 * Compact multi-line SVG chart of message rates (msg/min) over a time window.
 * Three fixed series — Sent / Received / Errors — sharing one Y-axis (all are
 * msg/min). Mirrors the lightweight, dependency-free approach of snr-chart.
 * Renders nothing when handed no data (the caller decides whether to fetch).
 */
@customElement('meshcore-message-rate-chart')
export class MessageRateChart extends LitElement {
  @property({ type: Array }) data: RatePoint[] = [];
  @property({ type: Number }) width = 700;
  @property({ type: Number }) height = 170;
  @property({ type: Number }) timeRange = 48; // hours

  static styles = css`
    :host { display: block; width: 100%; }
    svg { width: 100%; height: auto; display: block; }
    .chart-container {
      width: 100%;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      background: var(--input-bg);
      padding: 10px 12px;
      box-sizing: border-box;
    }
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
        ${this._renderChart()}
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

  private _renderChart() {
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

    return svg`
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Message rate over the last ${this.timeRange} hours">
        ${grid}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}"
          stroke="var(--divider-color,#e0e0e0)" stroke-width="1" />
        <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}"
          stroke="var(--divider-color,#e0e0e0)" stroke-width="1" />
        ${lines}
        ${xLabels}
        <text x="${padL}" y="${padT - 2}" font-size="9"
          fill="var(--secondary-text-color,#727272)">msg/min</text>
      </svg>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-message-rate-chart': MessageRateChart;
  }
}
