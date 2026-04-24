import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { HomeAssistant } from '../types';
import { longPress } from '../directives/long-press';

/**
 * Compact tile card for displaying a single HA sensor entity.
 * Left-click opens HA more-info dialog.
 * Right-click / long-press dispatches tile-context-menu event.
 */
@customElement('meshcore-sensor-tile')
export class SensorTile extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: String }) entityId = '';
  @property({ type: String }) label = '';
  @property({ type: String }) icon = '';
  @property({ type: String }) colorScheme: 'battery' | 'signal' | 'neutral' = 'neutral';

  static styles = css`
    :host {
      display: block;
    }

    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px 8px;
      border-radius: 8px;
      background: var(--primary-background-color, #fafafa);
      border: 1px solid var(--divider-color, #e0e0e0);
      min-width: 0;
      gap: 4px;
      transition: border-color 0.2s;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
    }

    .tile:hover {
      border-color: var(--primary-color, #03a9f4);
    }

    .tile:active {
      background: var(--secondary-background-color, #f0f0f0);
    }

    .tile-value-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-text-color);
      line-height: 1.2;
    }

    .tile-icon {
      display: flex;
      align-items: center;
      color: var(--secondary-text-color);
    }

    .tile-icon.battery-high { color: #4caf50; }
    .tile-icon.battery-medium { color: #ff9800; }
    .tile-icon.battery-low { color: #f44336; }
    .tile-icon.signal { color: #2196f3; }

    .tile-label {
      font-size: 11px;
      color: var(--secondary-text-color);
      text-align: center;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .tile-unit {
      font-size: 12px;
      font-weight: 400;
      color: var(--secondary-text-color);
    }

    .unavailable {
      opacity: 0.5;
    }
  `;

  render() {
    if (!this.hass || !this.entityId) return nothing;

    const stateObj = this.hass.states[this.entityId];
    if (!stateObj) return nothing;

    const value = stateObj.state;
    const unit = stateObj.attributes?.unit_of_measurement || '';
    const friendlyName = this.label || stateObj.attributes?.friendly_name || this.entityId;
    const isUnavailable = value === 'unavailable' || value === 'unknown';
    const displayPrecision = this.hass.entities?.[this.entityId]?.display_precision;

    // Determine icon color class
    let iconClass = '';
    if (this.colorScheme === 'battery') {
      const numVal = parseFloat(value);
      if (!isNaN(numVal)) {
        iconClass = numVal > 50 ? 'battery-high' : numVal > 20 ? 'battery-medium' : 'battery-low';
      }
    } else if (this.colorScheme === 'signal') {
      iconClass = 'signal';
    }

    return html`
      <div class="tile ${isUnavailable ? 'unavailable' : ''}"
           @click=${this._openMoreInfo}
           @contextmenu=${this._onRightClick}
           ${longPress(() => this._onRightClick(new MouseEvent('contextmenu')))}>
        <div class="tile-value-row">
          ${this.icon
            ? html`<span class="tile-icon ${iconClass}">${this._renderIcon()}</span>`
            : nothing}
          <span>${isUnavailable ? '—' : this._formatValue(value, displayPrecision)}${unit ? html`<span class="tile-unit">${unit}</span>` : nothing}</span>
        </div>
        <div class="tile-label">${friendlyName}</div>
      </div>
    `;
  }

  private _openMoreInfo() {
    if (!this.entityId) return;
    // Fire HA's native more-info event to open the entity dialog
    const event = new CustomEvent('hass-more-info', {
      detail: { entityId: this.entityId },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private _onRightClick(e: MouseEvent) {
    e.preventDefault();
    if (!this.entityId) return;
    this.dispatchEvent(new CustomEvent('tile-context-menu', {
      detail: { entityId: this.entityId, label: this.label },
      bubbles: true,
      composed: true,
    }));
  }

  private _formatValue(value: string, displayPrecision?: number | null): string {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    // Use HA's display_precision from the entity registry when available
    if (displayPrecision != null && displayPrecision >= 0) {
      return num.toFixed(displayPrecision);
    }
    // Fallback: preserve the original precision from the state string
    if (value.includes('.')) return value;
    return num.toString();
  }

  private _renderIcon() {
    switch (this.icon) {
      case 'battery':
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>`;
      case 'signal':
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
      case 'clock':
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;
      case 'power':
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.01 7L16 3h-2v4h-4V3H8v4h-.01C7 6.99 6 7.99 6 8.99v5.49L9.5 18v3h5v-3l3.5-3.51v-5.5c0-1-1-2-1.99-1.99z"/></svg>`;
      case 'thermometer':
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z"/></svg>`;
      case 'counter':
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;
      case 'chart':
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>`;
      default:
        return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-sensor-tile': SensorTile;
  }
}
