import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** Segment kinds correspond to the swatch styles in styles.ts. */
export type StackedBarSegmentKind =
  | 'flood'
  | 'direct'
  | 'other'
  | 'success'
  | 'failure'
  | 'tx'
  | 'rx'
  | 'idle';

export interface StackedBarSegment {
  /** Numeric value contributing to the bar fill. */
  value: number;
  /** Human-readable label used by the legend. */
  label: string;
  /** Visual kind — picks the colour swatch. */
  kind: StackedBarSegmentKind;
}

export type StackedBarLegend = 'inline' | 'below' | 'none';

/**
 * Multi-segment composite bar used for the three composite visualisations
 * on managed-repeater cards: Sent / Received message composition,
 * Request successes vs failures, and Radio activity (TX / RX / Idle).
 *
 * Inputs:
 *  - `segments`: array of { value, label, kind }
 *  - `total`: optional explicit denominator (defaults to sum of values).
 *    Used by the Radio-activity bar where the user-meaningful denominator
 *    is 100% of the reporting interval, not just TX+RX (Idle is the rest).
 *  - `legend`: 'inline' | 'below' | 'none' — defaults to 'below'.
 *
 * Segments with value 0 render as nothing (no inline gap, no legend swatch).
 * The "Other" segment in particular is expected to be 0 when MeshCore
 * firmware behaves as currently designed (nb_recv == flood + direct);
 * defensive support exists for future firmware that adds counted-but-
 * uncategorised packet types.
 *
 * The component does NOT colour itself by threshold — that's stat-bar's
 * job. Use stacked-bar when you need the proportions visible in one
 * eye-fixation; use stat-bar when you need a single value coloured by
 * its band.
 */
@customElement('meshcore-stacked-bar')
export class StackedBar extends LitElement {
  @property({ type: Array }) segments: StackedBarSegment[] = [];
  @property({ type: Number }) total?: number;
  @property({ type: String }) legend: StackedBarLegend = 'below';
  /** Optional final legend item rendered without a swatch — used by the
   *  Messages Sent / Received hero tiles to surface the msg/min rate
   *  next to the segment counts on the same line. */
  @property({ type: String }) extraLegendText?: string;

  static styles = css`
    :host { display: block; width: 100%; }

    .stat-bar {
      position: relative;
      height: 8px;
      width: 100%;
      background: var(--divider-color, #e0e0e0);
      border-radius: 4px;
      overflow: hidden;
      display: flex;
      gap: 1px;
    }
    .stat-bar-segment {
      height: 100%;
      transition: width 0.4s ease;
      cursor: help;
    }
    .stat-bar-segment.flood   { background: var(--info, #2196f3); }
    .stat-bar-segment.direct  { background: var(--good, #4caf50); }
    .stat-bar-segment.other   { background: var(--secondary-text-color); opacity: 0.55; }
    .stat-bar-segment.success { background: var(--good, #4caf50); }
    .stat-bar-segment.failure { background: var(--bad,  #f44336); }
    .stat-bar-segment.tx      { background: var(--info, #2196f3); }
    .stat-bar-segment.rx      { background: var(--good, #4caf50); }
    .stat-bar-segment.idle    { background: transparent; }

    .stat-bar-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin-top: 4px;
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .stat-bar-legend > span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .legend-swatch {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .legend-swatch.flood   { background: var(--info, #2196f3); }
    .legend-swatch.direct  { background: var(--good, #4caf50); }
    .legend-swatch.other   { background: var(--secondary-text-color); opacity: 0.55; }
    .legend-swatch.success { background: var(--good, #4caf50); }
    .legend-swatch.failure { background: var(--bad,  #f44336); }
    .legend-swatch.tx      { background: var(--info, #2196f3); }
    .legend-swatch.rx      { background: var(--good, #4caf50); }
    .legend-swatch.idle    {
      background: var(--divider-color, #e0e0e0);
      border: 1px solid var(--secondary-text-color);
    }

    .stat-bar-legend.inline {
      gap: 4px 8px;
      margin-top: 2px;
      font-size: 10px;
    }
  `;

  private _denom(): number {
    if (this.total !== undefined && this.total > 0) return this.total;
    const sum = this.segments.reduce(
      (acc, s) => acc + (Number.isFinite(s.value) ? s.value : 0),
      0,
    );
    return sum > 0 ? sum : 1; // avoid divide-by-zero; empty bar renders blank
  }

  render() {
    if (!this.segments.length) return nothing;
    const denom = this._denom();

    return html`
      <div class="stat-bar"
           role="img"
           aria-label="${this.segments.map((s) => `${s.label} ${s.value}`).join(', ')}">
        ${this.segments.map((s) => {
          const v = Number.isFinite(s.value) ? Math.max(0, s.value) : 0;
          if (v === 0) return nothing;
          const pct = (v / denom) * 100;
          return html`<div class="stat-bar-segment ${s.kind}"
                           style="width: ${pct}%"
                           title="${s.label}: ${s.value}"></div>`;
        })}
      </div>
      ${this.legend !== 'none'
        ? html`
          <div class="stat-bar-legend ${this.legend === 'inline' ? 'inline' : ''}">
            ${this.segments
              // Legend includes zero-value segments (e.g., "Other 0")
              // so visually-matching tiles read consistently. The bar
              // track itself filters them out (zero width is invisible
              // there).
              .filter((s) => Number.isFinite(s.value) && s.value >= 0)
              .map(
                (s) => html`<span><span class="legend-swatch ${s.kind}"></span>${s.label}</span>`,
              )}
            ${this.extraLegendText
              ? html`<span class="legend-extra">${this.extraLegendText}</span>`
              : nothing}
          </div>`
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-stacked-bar': StackedBar;
  }
}
