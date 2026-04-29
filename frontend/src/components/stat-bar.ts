import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Band } from '../utils/sensor-thresholds';

/**
 * Single-segment threshold bar used by the node-summary aggregated card.
 *
 * Inputs: `value`, `min`, `max`, `band`. Width is computed from
 * `(value - min) / (max - min)` clamped to [0, 100]. Width transitions
 * via CSS so updating values animates smoothly.
 *
 * Tick marks are deliberately not supported (Q6 resolved against ticks).
 * Tooltip text is owned by the parent label's `<meshcore-info-tip>`,
 * not by the bar itself.
 *
 * Colour variables (`--good`, `--warn`, `--bad`, `--info`) are declared
 * by the panel root once styles.ts (step 4) lands. Fallback hex values
 * keep the component renderable in isolation.
 */
@customElement('meshcore-stat-bar')
export class StatBar extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: String }) band: Band = 'info';

  static styles = css`
    :host {
      display: block;
      width: 100%;
    }
    .stat-bar {
      position: relative;
      height: 8px;
      width: 100%;
      background: var(--divider-color, #e0e0e0);
      border-radius: 4px;
      overflow: hidden;
    }
    .stat-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.4s ease;
    }
    .stat-bar-fill.good { background: var(--good, #4caf50); }
    .stat-bar-fill.warn { background: var(--warn, #ff9800); }
    .stat-bar-fill.bad  { background: var(--bad,  #f44336); }
    .stat-bar-fill.info { background: var(--info, #2196f3); }
  `;

  render() {
    const span = this.max - this.min;
    let pct = 0;
    if (Number.isFinite(this.value) && span > 0) {
      pct = ((this.value - this.min) / span) * 100;
      pct = Math.max(0, Math.min(100, pct));
    }
    return html`
      <div class="stat-bar"
           role="progressbar"
           aria-valuenow="${this.value}"
           aria-valuemin="${this.min}"
           aria-valuemax="${this.max}">
        <div class="stat-bar-fill ${this.band}"
             style="width: ${pct}%"></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-stat-bar': StatBar;
  }
}
