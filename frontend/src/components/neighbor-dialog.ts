import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { panelStyles } from '../styles';
import type { HomeAssistant, NeighborInfo } from '../types';
import { getNeighbors } from '../api';
import { attachDialogA11y } from '../utils/dialog-a11y';
import './snr-chart';

/**
 * Neighbor visualization dialog with SNR chart and details table.
 * Triggered from a repeater's "Neighbors" button.
 */
@customElement('meshcore-neighbor-dialog')
export class NeighborDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property() hass?: HomeAssistant;
  @property({ type: String }) entryId?: string;
  @property({ type: String }) targetPrefix?: string;
  @property({ type: String }) deviceName = '';
  @property({ type: Boolean }) narrow = false;

  @state() private _neighbors: NeighborInfo[] = [];
  @state() private _loading = true;
  @state() private _error: string | null = null;
  @state() private _chartData: Array<{ timestamp: number; values: Record<string, number> }> = [];

  constructor() {
    super();
    // Focus trap + Escape closes the dialog.
    attachDialogA11y(this, {
      isOpen: () => this.open,
      onEscape: () => this._onClose(),
    });
  }

  static styles = [
    panelStyles,
    css`
      :host {
        display: block;
      }
    `,
  ];

  willUpdate(changedProperties: Map<PropertyKey, unknown>) {
    if (
      (changedProperties.has('open') && this.open && this.targetPrefix) ||
      (changedProperties.has('targetPrefix') && this.open && this.targetPrefix)
    ) {
      this._loadNeighbors();
    }
  }

  private async _loadNeighbors() {
    if (!this.hass || !this.targetPrefix) return;

    this._loading = true;
    this._error = null;
    this._neighbors = [];
    this._chartData = [];

    try {
      // Fetch neighbor list
      const neighbors = await getNeighbors(this.hass, this.targetPrefix, this.entryId);
      this._neighbors = neighbors;

      // Try to fetch SNR history from HA statistics API
      if (neighbors.length > 0) {
        await this._fetchSNRHistory(neighbors);
      }
    } catch (err) {
      this._error = `Failed to load neighbors: ${String(err)}`;
      _LOGGER.error(this._error);
    } finally {
      this._loading = false;
    }
  }

  private async _fetchSNRHistory(neighbors: NeighborInfo[]) {
    if (!this.hass) return;

    try {
      // Build entity IDs for SNR sensors if available
      const neighborEntityIds: string[] = [];
      neighbors.forEach((neighbor) => {
        if (neighbor.entity_ids?.snr) {
          neighborEntityIds.push(neighbor.entity_ids.snr);
        }
      });

      if (neighborEntityIds.length === 0) {
        // No SNR entities to query
        return;
      }

      // Query HA recorder statistics API for SNR history
      const stats = await this.hass.callWS<Record<string, unknown>>({
        type: 'recorder/statistics_during_period',
        start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        statistic_ids: neighborEntityIds,
        period: 'hour',
      });

      // Convert statistics to chart data format
      // Group by hour, build {timestamp, values: {neighbor_prefix: snr}}
      const chartDataMap: Record<number, Record<string, number>> = {};

      Object.entries(stats).forEach(([entityId, points]) => {
        // Find matching neighbor for this entity
        const neighbor = neighbors.find((n) => n.entity_ids?.snr === entityId);
        if (!neighbor || !Array.isArray(points)) return;

        // Add each stat point
        (points as any[]).forEach((point) => {
          if (point.start && point.mean !== null && point.mean !== undefined) {
            const timestamp = new Date(point.start).getTime();
            if (!chartDataMap[timestamp]) {
              chartDataMap[timestamp] = {};
            }
            chartDataMap[timestamp][neighbor.pubkey_prefix] = point.mean as number;
          }
        });
      });

      // Convert map to sorted array
      this._chartData = Object.entries(chartDataMap)
        .map(([ts, values]) => ({
          timestamp: parseInt(ts, 10),
          values,
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
      // Non-critical — graceful fallback
      _LOGGER.debug(`SNR history fetch failed: ${String(err)}`);
    }
  }

  render() {
    if (!this.open) return nothing;

    return html`
      <div class="dialog-overlay" @click=${this._onOverlayClick}>
        <div
          class="dialog"
          ?narrow=${this.narrow}
          role="dialog"
          aria-modal="true"
          aria-label="Neighbors — ${this.deviceName}">
          <div class="dialog-header">
            <div class="dialog-header-title">Neighbors — ${this.deviceName}</div>
            <button class="dialog-button" aria-label="Close" @click=${this._onClose}>✕</button>
          </div>

          <div class="dialog-body">
            ${this._loading
              ? html`
                  <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <span>Loading neighbors...</span>
                  </div>
                `
              : this._error
                ? html`
                    <div class="error-state">
                      <span><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg></span>
                      <span>${this._error}</span>
                    </div>
                  `
                : this._neighbors.length === 0
                  ? html`
                      <div class="empty-state">
                        <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg></div>
                        <div class="empty-text">No neighbors found</div>
                      </div>
                    `
                  : html`
                      <!-- SNR Chart -->
                      ${this._chartData.length > 0
                        ? html`
                            <meshcore-snr-chart
                              .data=${this._chartData}
                              .neighbors=${this._neighbors.map((n) => n.pubkey_prefix)}
                              width="550"
                              height="250"
                              timeRange="24">
                            </meshcore-snr-chart>
                          `
                        : html``}

                      <!-- Neighbor Details Table -->
                      <table class="neighbor-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>SNR</th>
                            <th>Seen (48h)</th>
                            <th>Last Heard</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${this._neighbors.map(
                            (neighbor) => html`
                              <tr>
                                <td><code>${neighbor.name}</code></td>
                                <td style="${this._getSNRColorStyle(neighbor.snr)}">
                                  ${neighbor.snr.toFixed(1)} dB
                                </td>
                                <td>${neighbor.seen_48h ?? 0}×</td>
                                <td>${this._formatRelativeTime(neighbor.last_seen)}</td>
                              </tr>
                            `
                          )}
                        </tbody>
                      </table>
                    `}
          </div>

          <div class="dialog-footer">
            <button class="dialog-button" @click=${this._onClose}>Close</button>
          </div>
        </div>
      </div>
    `;
  }

  private _getSNRColorStyle(snr: number): string {
    if (snr > 5) {
      return 'color: #4caf50; font-weight: 600;'; // Green
    } else if (snr >= 0) {
      return 'color: #ff9800; font-weight: 600;'; // Orange
    } else {
      return 'color: #f44336; font-weight: 600;'; // Red
    }
  }

  private _formatRelativeTime(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return 'unknown';
    }
  }

  private _onOverlayClick(e: Event) {
    if (e.target === e.currentTarget) {
      this._onClose();
    }
  }

  private _onClose() {
    this.open = false;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-neighbor-dialog': NeighborDialog;
  }
}

const _LOGGER = console; // Minimal logging fallback
