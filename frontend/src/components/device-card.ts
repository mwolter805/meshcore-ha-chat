import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { panelStyles } from '../styles';
import type { ManagedDevice, HomeAssistant } from '../types';

@customElement('meshcore-device-card')
export class DeviceCard extends LitElement {
  @property({ type: Object }) device?: ManagedDevice;
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: String }) entryId?: string;
  @property({ type: Boolean }) narrow = false;

  static styles = [
    panelStyles,
    css`
      :host {
        display: block;
      }

      .device-card.disabled {
        opacity: 0.6;
        pointer-events: none;
      }

      .device-action-btn.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      .status-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
      }

      .status-indicator.online {
        background: rgba(76, 175, 80, 0.15);
        color: #2e7d32;
      }

      .status-indicator.offline {
        background: rgba(114, 114, 114, 0.15);
        color: #424242;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }

      .status-dot.online {
        background: #4caf50;
      }

      .status-dot.offline {
        background: #727272;
      }

      :host([narrow]) .device-stats {
        grid-template-columns: 1fr;
      }

      :host([narrow]) .device-actions {
        flex-wrap: wrap;
      }
    `,
  ];

  render() {
    if (!this.device) return html``;

    const d = this.device;
    const isOnline = d.connected;
    const typeIcon = d.type === 'repeater'
      ? html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px;"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
      : html`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px;"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`;
    const typeBadge = d.type === 'repeater' ? 'Repeater' : 'Client';

    return html`
      <div class=${`device-card ${isOnline ? '' : 'disabled'}`}>
        <!-- Header -->
        <div class="device-header">
          <div>
            <div class="device-name">${typeIcon} ${d.name}</div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="device-type">${typeBadge}</span>
            <div class=${`status-indicator ${isOnline ? 'online' : 'offline'}`}>
              <span class=${`status-dot ${isOnline ? 'online' : 'offline'}`}></span>
              ${isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>

        <!-- Stats Grid -->
        ${this._renderStats()}

        <!-- Action Buttons -->
        <div class="device-actions">
          ${this._renderCommonActions(isOnline)}
          ${d.type === 'repeater' ? this._renderRepeaterActions(isOnline) : nothing}
        </div>

        <!-- Issue Command Button -->
        <button
          class="device-action-btn"
          style="width: 100%; margin-top: 4px;"
          ?disabled=${!isOnline}
          @click=${() => this._dispatchIssueCommand()}>
          Issue Command
        </button>
      </div>
    `;
  }

  private _renderStats() {
    const d = this.device;
    if (!d) return nothing;

    const stats = d.stats || {};
    const items = [];

    if (stats.battery !== undefined) {
      items.push(html`
        <div class="device-stat">
          <div class="device-stat-label">Battery</div>
          <div>${stats.battery}%</div>
        </div>
      `);
    }

    if (stats.uptime !== undefined) {
      items.push(html`
        <div class="device-stat">
          <div class="device-stat-label">Uptime</div>
          <div>${this._formatUptime((stats.uptime as number) ?? 0)}</div>
        </div>
      `);
    }

    if (stats.snr !== undefined) {
      items.push(html`
        <div class="device-stat">
          <div class="device-stat-label">SNR</div>
          <div>${stats.snr} dB</div>
        </div>
      `);
    }

    if (stats.contact_count !== undefined) {
      items.push(html`
        <div class="device-stat">
          <div class="device-stat-label">Contacts</div>
          <div>${stats.contact_count}</div>
        </div>
      `);
    }

    if (stats.tx_power !== undefined) {
      items.push(html`
        <div class="device-stat">
          <div class="device-stat-label">TX Power</div>
          <div>${stats.tx_power} dBm</div>
        </div>
      `);
    }

    if (this.device?.update_interval !== undefined) {
      items.push(html`
        <div class="device-stat">
          <div class="device-stat-label">Update Interval</div>
          <div>${this.device.update_interval}s</div>
        </div>
      `);
    }

    if (items.length === 0) {
      return nothing;
    }

    return html`<div class="device-stats">${items}</div>`;
  }

  private _renderCommonActions(isOnline: boolean) {
    return html`
      <button
        class=${`device-action-btn ${!isOnline ? 'disabled' : ''}`}
        ?disabled=${!isOnline}
        @click=${() => this._dispatchAction('reboot')}>
        Reboot
      </button>
      <button
        class=${`device-action-btn ${!isOnline ? 'disabled' : ''}`}
        ?disabled=${!isOnline}
        @click=${() => this._dispatchAction('flood-advert')}>
        Flood Advert
      </button>
      <button
        class=${`device-action-btn ${!isOnline ? 'disabled' : ''}`}
        ?disabled=${!isOnline}
        @click=${() => this._dispatchAction('sync-clock')}>
        Sync Clock
      </button>
      <button
        class=${`device-action-btn ${!isOnline ? 'disabled' : ''}`}
        ?disabled=${!isOnline}
        @click=${() => this._dispatchAction('req-telemetry')}>
        Req Telemetry
      </button>
      <button
        class=${`device-action-btn ${!isOnline ? 'disabled' : ''}`}
        ?disabled=${!isOnline}
        @click=${() => this._dispatchAction('req-status')}>
        Req Status
      </button>
    `;
  }

  private _renderRepeaterActions(isOnline: boolean) {
    return html`
      <button
        class=${`device-action-btn ${!isOnline ? 'disabled' : ''}`}
        ?disabled=${!isOnline}
        @click=${() => this._dispatchAction('start-ota')}>
        Start OTA
      </button>
      <button
        class=${`device-action-btn ${!isOnline ? 'disabled' : ''}`}
        ?disabled=${!isOnline}
        @click=${() => this._dispatchAction('neighbors')}>
        Neighbors
      </button>
    `;
  }

  private _dispatchAction(action: string) {
    if (!this.device) return;
    this.dispatchEvent(
      new CustomEvent('device-action', {
        detail: { device: this.device, action },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _dispatchIssueCommand() {
    if (!this.device) return;
    this.dispatchEvent(
      new CustomEvent('open-command-dialog', {
        detail: { device: this.device },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-device-card': DeviceCard;
  }
}
