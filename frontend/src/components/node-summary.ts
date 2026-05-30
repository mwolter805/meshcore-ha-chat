import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, ManagedDevice } from '../types';
import type { EntityInfo } from '../utils/classify-entity';
import {
  evaluateSensor,
  type Band,
  type MetricKey,
  type SensorEval,
} from '../utils/sensor-thresholds';
import { longPress } from '../directives/long-press';
import './stat-bar';
import './stacked-bar';
import './info-tip';
import './message-rate-chart';
import type { StackedBarSegment } from './stacked-bar';
import type { RatePoint } from './message-rate-chart';

/**
 * Synthesized device descriptor for the Settings tab's companion device.
 * The companion's underlying type is `MeshCoreDevice` (see types.ts) which
 * doesn't share a shape with `ManagedDevice`; the page-level adapter wraps
 * it into this descriptor so node-summary's discriminated-union switch
 * works uniformly.
 */
export interface CompanionDeviceDescriptor {
  type: 'companion';
  name: string;
  pubkey_prefix: string;
  connected: boolean;
  firmware?: string;
  entry_id?: string;
}

export type NodeSummaryDevice = ManagedDevice | CompanionDeviceDescriptor;

type GroupName =
  | 'Radio · live'
  | 'Radio · configuration'
  | 'Status'
  | 'Identity';

/**
 * Aggregated card body used by the Devices and Settings tabs in place of
 * the prior flat tile grid. Pairs a "hero row" of headline values with a
 * categorised, threshold-banded table of every other meshcore sensor on
 * the node.
 *
 * Layout per node type:
 *  - Repeater: 4-tile hero row (Battery / Last message strength /
 *    Radio activity / Location); every Power/Radio/Traffic/Status group
 *    that has any sensors renders.
 *  - Client: 3-tile hero row (Battery / Last message strength / Location);
 *    only the Status group renders below.
 *  - Companion: 3-tile hero row (Mesh node count / Location / Power);
 *    Radio · configuration is the dominant table group.
 *
 * The component owns the hero row, the table, and the (N hidden) suffix.
 * It does NOT own the outer .device-section wrapper, the header (icon +
 * name + meta + status badge), or the actions row — those continue to
 * live in devices-page.ts and settings-page.ts so the per-page differences
 * (icon glyph, action handlers) stay where they belong.
 *
 * Click on any row fires `hass-more-info` so the existing entity-deep-link
 * UX is preserved. Long-press fires `tile-context-menu` so the existing
 * sensor-hide flow is preserved.
 */
@customElement('meshcore-node-summary')
export class NodeSummary extends LitElement {
  @property({ type: Object }) hass?: HomeAssistant;
  @property({ type: Object }) device?: NodeSummaryDevice;
  @property({ type: Array }) entities: EntityInfo[] = [];
  @property({ type: Number }) hiddenCount = 0;
  /** Fallback location for nodes that don't expose lat/lon as sensor
   *  entities (typical for managed repeaters/clients — their location
   *  comes from the user's contact list via Contact.adv_lat/adv_lon).
   *  When set and no dedicated entity is found, the Location hero tile
   *  shows these. */
  @property({ type: Number }) fallbackLatitude?: number;
  @property({ type: Number }) fallbackLongitude?: number;
  /** Unix-seconds timestamp accompanying the fallback location (e.g.,
   *  Contact.last_advert). Used for the "Updated X ago" line beneath
   *  the coordinates in the Location hero tile. */
  @property({ type: Number }) fallbackUpdated?: number;

  /** 48h message-rate history (msg/min) for the activity chart, fetched from
   *  recorder statistics for the node's *_rate sensors. */
  @state() private _rateHistory: RatePoint[] = [];
  /** Guard: the nb_sent entity_id the current _rateHistory was fetched for,
   *  so we fetch once per device rather than on every hass state push. */
  private _rateHistoryKey: string | null = null;

  static styles = css`
    /* container-type lets the sensor grid's @container query react to this
       card's own width rather than the raw viewport. */
    :host { display: block; container-type: inline-size; }

    /* ─── Hero row ─── */
    .hero-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .hero-tile {
      background: var(--secondary-background-color, #f0f0f0);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: border-color 0.15s;
    }
    .hero-tile:hover { border-color: var(--primary-color, #03a9f4); }
    .hero-tile-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--secondary-text-color);
    }
    .hero-tile-value {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
    }
    .hero-tile-value .primary {
      font-size: 22px;
      font-weight: 600;
      color: var(--primary-text-color);
      line-height: 1;
    }
    .hero-tile-value .secondary {
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .hero-tile-value .compact {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
    }
    /* Clickable TX/RX segments inside Radio activity hero tile */
    .ra-segment {
      cursor: pointer;
      border-radius: 3px;
      padding: 0 2px;
      transition: background 0.15s;
    }
    .ra-segment:hover {
      background: rgba(127, 127, 127, 0.18);
    }

    /* Bar + custom legend wrapper — keeps the legend tight to the bar
       (4px) regardless of the hero-tile's 8px flex-column gap, matching
       the spacing inside Messages Sent / Received tiles. */
    .ra-bar-wrap { display: block; }

    /* Radio activity legend (matches the stacked-bar inline legend
       layout used by Messages Sent / Received) */
    .ra-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin-top: 4px;
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .ra-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .ra-legend-item:hover {
      color: var(--primary-text-color);
      cursor: pointer;
    }
    .legend-swatch {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .legend-swatch.tx   { background: var(--info, #2196f3); }
    .legend-swatch.rx   { background: var(--good, #4caf50); }
    .legend-swatch.idle {
      background: var(--divider-color, #e0e0e0);
      border: 1px solid var(--secondary-text-color);
    }

    /* ─── Status dots ─── */
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      display: inline-block;
    }
    .status-dot.good { background: var(--good, #4caf50); }
    .status-dot.warn { background: var(--warn, #ff9800); }
    .status-dot.bad  { background: var(--bad,  #f44336); }
    .status-dot.info { background: var(--info, #2196f3); }

    /* ─── Subsection label ─── */
    .subsection-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      margin-top: 16px;
    }
    .hidden-suffix {
      font-weight: 400;
      text-transform: none;
      opacity: 0.6;
      margin-left: 6px;
    }

    /* ─── Sensor grid ─── responsive: one column on a narrow card, two
       once the card is wide. The breakpoint is a @container query keyed on
       :host's inline-size, so it reacts to the card width (panel layout,
       sidebar state) rather than just the raw viewport. Category headers
       span the full width so paired sensors stay within their category. */
    .sensor-grid {
      display: grid;
      grid-template-columns: 1fr;
      column-gap: 28px;
    }
    @container (min-width: 620px) {
      .sensor-grid { grid-template-columns: 1fr 1fr; }
    }
    .group-label {
      grid-column: 1 / -1;
      padding: 12px 4px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--secondary-text-color);
    }
    .sensor-item {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr) auto minmax(72px, 120px);
      align-items: center;
      gap: 10px;
      padding: 8px 4px;
      border-top: 1px solid var(--divider-color);
      font-size: 13px;
      cursor: pointer;
    }
    .sensor-item:hover { background: rgba(127, 127, 127, 0.06); }
    .si-label {
      color: var(--secondary-text-color);
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .si-value {
      color: var(--primary-text-color);
      font-weight: 500;
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .si-bar { min-width: 0; }
    .si-bar meshcore-stat-bar { width: 100%; }

    .unit {
      font-size: 11px;
      font-weight: 400;
      color: var(--secondary-text-color);
      margin-left: 2px;
    }

    .map-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 12px;
      background: var(--info-bg, rgba(33, 150, 243, 0.18));
      color: var(--info, #2196f3);
      font-size: 11px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
    }
    .coord-pair {
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      font-size: 13px;
      color: var(--primary-text-color);
    }
    .loc-updated {
      font-size: 11px;
      color: var(--secondary-text-color);
      margin-top: 2px;
    }

    .dup-annotation {
      font-size: 11px;
      color: var(--secondary-text-color);
      font-style: italic;
      margin-top: 2px;
    }
    .dup-annotation .num {
      font-weight: 500;
      color: var(--primary-text-color);
      font-style: normal;
    }
    /* Thin red line beneath the Messages Received composition bar showing
       the lifetime receive-error share. */
    .err-line {
      height: 3px;
      width: 100%;
      margin-top: 3px;
      background: var(--divider-color, #e0e0e0);
      border-radius: 2px;
      overflow: hidden;
      cursor: help;
    }
    .err-line-fill {
      height: 100%;
      background: var(--bad, #f44336);
    }
    /* Duplicates line — same thin track, amber fill, stacked under the
       error line. */
    .dup-line {
      height: 3px;
      width: 100%;
      margin-top: 2px;
      background: var(--divider-color, #e0e0e0);
      border-radius: 2px;
      overflow: hidden;
      cursor: help;
    }
    .dup-line-fill {
      height: 100%;
      background: var(--warning, #ff9800);
    }
    /* Unified legend beneath the Messages Received bar stack. */
    .msg-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      margin-top: 5px;
      font-size: 10px;
      color: var(--secondary-text-color);
    }
    .msg-legend > span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .msg-swatch {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .msg-swatch.flood  { background: var(--info, #2196f3); }
    .msg-swatch.direct { background: var(--good, #4caf50); }
    .msg-swatch.error  { background: var(--bad, #f44336); }
    .msg-swatch.dup    { background: var(--warning, #ff9800); }
  `;

  // ─── Render ────────────────────────────────────────────────────────────

  render() {
    if (!this.hass || !this.device) return nothing;

    // The hero tiles for repeaters consume traffic-totals entities
    // (nb_sent / sent_flood / sent_direct / nb_recv / recv_flood /
    // recv_direct / dups / request_succ / request_fail). We share this
    // Set with _buildGroups so those entities don't double-render as
    // table rows.
    const consumed = new Set<string>();
    const heroTiles = this._renderHeroTiles(consumed);
    const groups = this._buildGroups(consumed);

    return html`
      <div class="hero-row">
        ${heroTiles}
      </div>

      ${this._renderMessageActivityCard()}

      ${groups.length > 0
        ? html`
          <div class="subsection-label">
            Sensors${this.hiddenCount > 0
              ? html`<span class="hidden-suffix">(${this.hiddenCount} hidden)</span>`
              : nothing}
          </div>

          <div class="sensor-grid">
            ${groups.map((g) => this._renderGroup(g))}
          </div>`
        : nothing}
    `;
  }

  // ─── Message activity (48h rate history) ──────────────────────────────

  /** Fetch once per device when entities/hass become available. The hass
   *  object identity changes on every state push, so guard on the nb_sent
   *  entity_id to avoid refetching on every update. */
  updated(changed: Map<string, unknown>) {
    if (!this.hass || !this.device) return;
    if (!changed.has('hass') && !changed.has('device') && !changed.has('entities')) return;
    const nbSent = this._findEntityIdMatching('nb_sent');
    const key = nbSent?.entity_id ?? null;
    if (key && key !== this._rateHistoryKey) {
      this._rateHistoryKey = key;
      void this._fetchRateHistory();
    } else if (!key && this._rateHistoryKey !== null) {
      this._rateHistoryKey = null;
      this._rateHistory = [];
    }
  }

  /** Derive a `_rate` sibling entity_id from a totals entity_id. The rate
   *  sensors are excluded from `entities` by classify-entity but follow the
   *  fixed `..._<key>_rate_<suffix>` pattern (mirrors _readDerivedRate). */
  private _deriveRateId(totalsEid: string, key: string): string {
    return totalsEid.replace(`_${key}_`, `_${key}_rate_`);
  }

  private async _fetchRateHistory(): Promise<void> {
    if (!this.hass) return;
    // Five series: sent + received split into flood/direct, plus errors.
    // Each maps a totals entity to its `_rate` sibling statistic.
    const wanted: Array<[string, string]> = [
      ['sent_flood', 'sent_flood'],
      ['sent_direct', 'sent_direct'],
      ['recv_flood', 'recv_flood'],
      ['recv_direct', 'recv_direct'],
      ['errors', 'recv_errors'],
    ];
    const series: Array<[string, string]> = [];
    for (const [seriesKey, totalsKey] of wanted) {
      const info = this._findEntityIdMatching(totalsKey);
      if (info) series.push([seriesKey, this._deriveRateId(info.entity_id, totalsKey)]);
    }
    if (series.length === 0) { this._rateHistory = []; return; }

    try {
      const stats = await this.hass.callWS<Record<string, Array<{ start?: string; mean?: number }>>>({
        type: 'recorder/statistics_during_period',
        start_time: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        end_time: new Date().toISOString(),
        statistic_ids: series.map(([, id]) => id),
        period: 'hour',
      });
      const byTs: Record<number, Record<string, number>> = {};
      for (const [seriesKey, statId] of series) {
        const pts = stats[statId];
        if (!Array.isArray(pts)) continue;
        for (const p of pts) {
          if (p.start == null || p.mean == null) continue;
          const ts = new Date(p.start).getTime();
          (byTs[ts] ??= {})[seriesKey] = p.mean;
        }
      }
      this._rateHistory = Object.entries(byTs)
        .map(([ts, values]) => ({ timestamp: parseInt(ts, 10), values }))
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      this._rateHistory = [];
    }
  }

  private _renderMessageActivityCard() {
    if (!this._rateHistory.length) return nothing;
    return html`
      <div class="subsection-label">Message activity (48h)</div>
      <meshcore-message-rate-chart .data=${this._rateHistory}></meshcore-message-rate-chart>
    `;
  }

  // ─── Hero row variants ────────────────────────────────────────────────

  private _renderHeroTiles(consumed: Set<string>): TemplateResult | typeof nothing {
    const dev = this.device!;
    if (dev.type === 'companion') return this._renderCompanionHero(consumed);
    if (dev.type === 'repeater') return this._renderRepeaterHero(consumed);
    return this._renderClientHero(consumed);
  }

  // Managed-device (repeater/client) location is shown as a compact "Loc:"
  // stat in the card header (devices-page) rather than a hero tile, so it is
  // not rendered here. The companion keeps its Location hero tile.
  private _renderRepeaterHero(consumed: Set<string>) {
    return html`
      ${this._renderBatteryTile()}
      ${this._renderSignalTile()}
      ${this._renderRadioActivityTile()}
      ${this._renderMessagesSentTile(consumed)}
      ${this._renderMessagesReceivedTile(consumed)}
      ${this._renderRequestsTile(consumed)}
    `;
  }

  private _renderClientHero(consumed: Set<string>) {
    return html`
      ${this._renderBatteryTile()}
      ${this._renderSignalTile()}
      ${this._renderRequestsTile(consumed)}
    `;
  }

  // Companion hero mirrors the repeater hero so the locally-attached node
  // gets the same rich tiles once its self-diagnostic entities exist. Every
  // tile self-hides when its backing entity is absent, so a companion with
  // no Self Diagnostics and no battery simply renders no hero tiles. The
  // battery slot uses _renderBatteryTile directly — it shows the battery
  // card when a battery is present and renders nothing otherwise (no "USB /
  // mains" placeholder).
  private _renderCompanionHero(consumed: Set<string>) {
    return html`
      ${this._renderBatteryTile()}
      ${this._renderSignalTile()}
      ${this._renderCompanionRadioActivityTile()}
      ${this._renderMessagesSentTile(consumed)}
      ${this._renderMessagesReceivedTile(consumed)}
      ${this._renderLocationTile()}
    `;
  }

  private _renderBatteryTile() {
    const battery = this._findByMetric('battery_pct');
    if (!battery) return nothing; // mains-powered node — omit tile
    const pct = this._readNumber(battery.entity_id);
    const voltage = this._findEntityIdMatching('battery_voltage') ?? this._findEntityByLabel('Voltage');
    const voltageVal = voltage ? this._readNumber(voltage.entity_id) : NaN;
    const ev = evaluateSensor('battery_pct', pct);

    return html`
      <div class="hero-tile" @click=${() => this._fireMoreInfo(battery.entity_id)}>
        <div class="hero-tile-head">
          <span>Battery${this._renderInfoTip(ev)}</span>
          <span class="status-dot ${ev.band}"></span>
        </div>
        <div class="hero-tile-value">
          <span class="primary">
            ${this._formatNumber(pct, 0)}<span class="unit">%</span>
          </span>
          ${Number.isFinite(voltageVal)
            ? html`<span class="secondary">· ${voltageVal.toFixed(3)} V</span>`
            : nothing}
        </div>
        <meshcore-stat-bar
          .value=${pct}
          .min=${0}
          .max=${100}
          .band=${ev.band}>
        </meshcore-stat-bar>
      </div>
    `;
  }

  private _renderSignalTile() {
    const rssi = this._findByMetric('rssi');
    if (!rssi) return nothing;
    const rssiVal = this._readNumber(rssi.entity_id);
    const snr = this._findByMetric('snr');
    const snrVal = snr ? this._readNumber(snr.entity_id) : NaN;
    const ev = evaluateSensor('rssi', rssiVal);

    return html`
      <div class="hero-tile" @click=${() => this._fireMoreInfo(rssi.entity_id)}>
        <div class="hero-tile-head">
          <span>Last message strength${this._renderInfoTip(ev)}</span>
          <span class="status-dot ${ev.band}"></span>
        </div>
        <div class="hero-tile-value">
          <span class="primary">
            ${this._formatNumber(rssiVal, 0)}<span class="unit">dBm</span>
          </span>
          ${Number.isFinite(snrVal)
            ? html`<span class="secondary">· SNR ${snrVal.toFixed(1)} dB</span>`
            : nothing}
        </div>
        <meshcore-stat-bar
          .value=${rssiVal}
          .min=${-130}
          .max=${-30}
          .band=${ev.band}>
        </meshcore-stat-bar>
      </div>
    `;
  }

  private _renderRadioActivityTile() {
    const tx = this._findByMetric('tx_airtime_util');
    const rx = this._findByMetric('rx_airtime_util');
    if (!tx && !rx) return nothing;
    const txVal = tx ? this._readNumber(tx.entity_id) : 0;
    const rxVal = rx ? this._readNumber(rx.entity_id) : 0;
    const txN = Number.isFinite(txVal) ? Math.max(0, txVal) : 0;
    const rxN = Number.isFinite(rxVal) ? Math.max(0, rxVal) : 0;
    const idleN = Math.max(0, 100 - txN - rxN);

    // Use the worse of the two airtime bands as the dot.
    const txBand = evaluateSensor('tx_airtime_util', txN).band;
    const rxBand = evaluateSensor('rx_airtime_util', rxN).band;
    const dotBand: Band = this._worseBand(txBand, rxBand);

    const segments: StackedBarSegment[] = [
      { value: txN, label: `TX ${txN.toFixed(1)}%`, kind: 'tx' },
      { value: rxN, label: `RX ${rxN.toFixed(1)}%`, kind: 'rx' },
      { value: idleN, label: `Idle ${idleN.toFixed(1)}%`, kind: 'idle' },
    ];

    // Click handlers for the TX / RX text segments — open more-info for
    // the corresponding utilization entity. Idle has no entity to deep-link
    // to, so it stays plain text. Each handler stops propagation so the
    // parent tile's click doesn't double-fire.
    const onTxClick = (e: Event) => {
      e.stopPropagation();
      if (tx) this._fireMoreInfo(tx.entity_id);
    };
    const onRxClick = (e: Event) => {
      e.stopPropagation();
      if (rx) this._fireMoreInfo(rx.entity_id);
    };

    const totalUsed = txN + rxN;

    return html`
      <div class="hero-tile"
           @click=${() => tx && this._fireMoreInfo(tx.entity_id)}>
        <div class="hero-tile-head">
          <span>Radio activity${this._renderInfoTip({
            band: dotBand,
            fillPct: 0,
            tooltip: 'Half-duplex composition over the last reporting interval. ' +
                     'The radio can transmit OR receive, never both. TX above 10% ' +
                     'indicates duty-cycle pressure; sustained TX+RX above 30% ' +
                     'means the channel is congested.',
          })}</span>
          <span class="status-dot ${dotBand}"></span>
        </div>
        <div class="hero-tile-value">
          <span class="primary">${totalUsed.toFixed(1)}<span class="unit">%</span></span>
        </div>
        <div class="ra-bar-wrap">
          <meshcore-stacked-bar
            .segments=${segments}
            .total=${100}
            .legend=${'none'}>
          </meshcore-stacked-bar>
          <div class="ra-legend">
            ${tx
              ? html`<span class="ra-legend-item" @click=${onTxClick}>
                  <span class="legend-swatch tx"></span>TX ${txN.toFixed(1)}%
                </span>`
              : html`<span class="ra-legend-item">
                  <span class="legend-swatch tx"></span>TX ${txN.toFixed(1)}%
                </span>`}
            ${rx
              ? html`<span class="ra-legend-item" @click=${onRxClick}>
                  <span class="legend-swatch rx"></span>RX ${rxN.toFixed(1)}%
                </span>`
              : html`<span class="ra-legend-item">
                  <span class="legend-swatch rx"></span>RX ${rxN.toFixed(1)}%
                </span>`}
            <span class="ra-legend-item">
              <span class="legend-swatch idle"></span>Idle ${idleN.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private _renderMessagesSentTile(consumed: Set<string>) {
    const nbSent = this._findEntityIdMatching('nb_sent');
    const sentFlood = this._findEntityIdMatching('sent_flood');
    const sentDirect = this._findEntityIdMatching('sent_direct');
    if (!nbSent || (!sentFlood && !sentDirect)) return nothing;

    const totalSent = this._readNumber(nbSent.entity_id);
    const flood = sentFlood ? this._readNumber(sentFlood.entity_id) : 0;
    const direct = sentDirect ? this._readNumber(sentDirect.entity_id) : 0;
    const segs: StackedBarSegment[] = [
      { value: flood,  label: `Flood ${flood}`,   kind: 'flood' },
      { value: direct, label: `Direct ${direct}`, kind: 'direct' },
    ];
    consumed.add(nbSent.entity_id);
    if (sentFlood) consumed.add(sentFlood.entity_id);
    if (sentDirect) consumed.add(sentDirect.entity_id);

    return html`
      <div class="hero-tile" @click=${() => this._fireMoreInfo(nbSent.entity_id)}>
        <div class="hero-tile-head">
          <span>Messages Sent${this._renderInfoTip({
            band: 'info',
            fillPct: 0,
            tooltip:
              'Messages sent (lifetime), split by send mode:\n' +
              '• Flood — broadcast retransmits visible to all neighbours.\n' +
              '• Direct — routed point-to-point along a path.',
          })}</span>
          <span class="status-dot info"></span>
        </div>
        <div class="hero-tile-value">
          <span class="primary">${this._formatCount(totalSent)}</span>
        </div>
        <meshcore-stacked-bar
          .segments=${segs}
          .legend=${'inline'}>
        </meshcore-stacked-bar>
      </div>
    `;
  }

  private _renderMessagesReceivedTile(consumed: Set<string>) {
    const nbRecv = this._findEntityIdMatching('nb_recv');
    const recvFlood = this._findEntityIdMatching('recv_flood');
    const recvDirect = this._findEntityIdMatching('recv_direct');
    const floodDups = this._findEntityIdMatching('flood_dups');
    const directDups = this._findEntityIdMatching('direct_dups');
    if (!nbRecv || (!recvFlood && !recvDirect)) return nothing;

    const totalRecv = this._readNumber(nbRecv.entity_id);
    const flood = recvFlood ? this._readNumber(recvFlood.entity_id) : 0;
    const direct = recvDirect ? this._readNumber(recvDirect.entity_id) : 0;
    const segs: StackedBarSegment[] = [
      { value: flood,  label: `Flood ${flood}`,   kind: 'flood' },
      { value: direct, label: `Direct ${direct}`, kind: 'direct' },
    ];

    const fdups = floodDups ? this._readNumber(floodDups.entity_id) : 0;
    const ddups = directDups ? this._readNumber(directDups.entity_id) : 0;
    const totalDups = (Number.isFinite(fdups) ? fdups : 0)
                    + (Number.isFinite(ddups) ? ddups : 0);
    const dupRatio = totalRecv > 0 ? (totalDups / totalRecv) * 100 : 0;
    // Dup ratio is informational only -- no banding (see iter14 commit).

    consumed.add(nbRecv.entity_id);
    if (recvFlood) consumed.add(recvFlood.entity_id);
    if (recvDirect) consumed.add(recvDirect.entity_id);
    if (floodDups) consumed.add(floodDups.entity_id);
    if (directDups) consumed.add(directDups.entity_id);

    // recv_errors (STATS_PACKETS counter): surfaced as a thin red line in the
    // bar stack plus an "Error N" legend item -- not a separate table row.
    // Applies to any node that reports it (companion + managed repeater).
    // Each bar is a percentage of its OWN total (verified against firmware):
    //  - errors are CRC failures, DISJOINT from received (RadioLibWrappers:
    //    n_recv vs n_recv_errors), so the error rate's denominator is all
    //    reception attempts = received + errors.
    //  - duplicates are a SUBSET of received, so their denominator is nb_recv.
    const recvErrorsInfo = this._findEntityIdMatching('recv_errors');
    const recvErrorsRaw = recvErrorsInfo
      ? this._readNumber(recvErrorsInfo.entity_id)
      : NaN;
    const recvErrorsN = Number.isFinite(recvErrorsRaw) ? recvErrorsRaw : 0;
    const attempts = totalRecv + recvErrorsN;
    const errRatio = attempts > 0 ? (recvErrorsN / attempts) * 100 : 0;
    if (recvErrorsInfo) consumed.add(recvErrorsInfo.entity_id);

    return html`
      <div class="hero-tile" @click=${() => this._fireMoreInfo(nbRecv.entity_id)}>
        <div class="hero-tile-head">
          <span>Messages Received${this._renderInfoTip({
            band: 'info',
            fillPct: 0,
            tooltip:
              'Messages received (lifetime), split by receive mode:\n' +
              '• Flood — broadcast packets received from neighbours.\n' +
              '• Direct — routed packets where this node is on the path.\n\n' +
              'Each bar below is a percentage of its own total:\n' +
              '• Red = receive errors (CRC failures), as a share of all ' +
              'reception attempts (received + errors) — i.e. the error rate.\n' +
              '• Amber = duplicate receptions, as a share of received ' +
              'messages (duplicates are a subset of received).\n\n' +
              'Both are context only, not banded — in a flooding mesh every ' +
              'active neighbour retransmits the same flood once, so a high ' +
              'duplicate ratio is normal (a 2-neighbour repeater sees ~50%, ' +
              'a 3-neighbour ~67%, etc.).',
          })}</span>
          <span class="status-dot info"></span>
        </div>
        <div class="hero-tile-value">
          <span class="primary">${this._formatCount(totalRecv)}</span>
        </div>
        <meshcore-stacked-bar
          .segments=${segs}
          .legend=${'none'}>
        </meshcore-stacked-bar>
        ${recvErrorsN > 0
          ? html`<div class="err-line"
                      title="Receive errors (CRC failures): ${recvErrorsN} — ${errRatio.toFixed(1)}% of reception attempts (received + errors)">
              <div class="err-line-fill" style="width:${Math.min(100, errRatio).toFixed(1)}%"></div>
            </div>`
          : nothing}
        ${totalDups > 0
          ? html`<div class="dup-line"
                      title="Duplicate receptions: ${totalDups} — ${dupRatio.toFixed(1)}% of received messages">
              <div class="dup-line-fill" style="width:${Math.min(100, dupRatio).toFixed(1)}%"></div>
            </div>`
          : nothing}
        <div class="msg-legend">
          <span><span class="msg-swatch flood"></span>Flood ${flood}</span>
          <span><span class="msg-swatch direct"></span>Direct ${direct}</span>
          ${recvErrorsN > 0
            ? html`<span><span class="msg-swatch error"></span>Error ${recvErrorsN}</span>`
            : nothing}
          ${totalDups > 0
            ? html`<span><span class="msg-swatch dup"></span>Dup ${totalDups}</span>`
            : nothing}
        </div>
      </div>
    `;
  }

  private _renderRequestsTile(consumed: Set<string>) {
    const successes = this._findEntityIdMatching('request_succ');
    const failures = this._findEntityIdMatching('request_fail');
    if (!successes || !failures) return nothing;

    const sVal = this._readNumber(successes.entity_id);
    const fVal = this._readNumber(failures.entity_id);
    const total = sVal + fVal;
    const rate = total > 0 ? (sVal / total) * 100 : 0;
    const ev: SensorEval = total >= 50
      ? evaluateSensor('request_success_rate', rate)
      : { band: 'info', fillPct: 0, tooltip: '' };

    const tooltip =
      'Outgoing requests this node initiated (login, telemetry, ' +
      'neighbour query) and how they resolved. Success rate bands: ' +
      'Green > 90%, Yellow 70–90%, Red < 70%, with a minimum sample ' +
      'of 50 attempts to colour. Below the floor, the bar stays ' +
      'neutral — too few samples to judge.';

    const segs: StackedBarSegment[] = [
      { value: sVal, label: `OK ${sVal}`,    kind: 'success' },
      { value: fVal, label: `Fail ${fVal}`, kind: 'failure' },
    ];

    consumed.add(successes.entity_id);
    consumed.add(failures.entity_id);

    return html`
      <div class="hero-tile" @click=${() => this._fireMoreInfo(successes.entity_id)}>
        <div class="hero-tile-head">
          <span>Requests${this._renderInfoTip({ ...ev, tooltip })}</span>
          <span class="status-dot ${ev.band}"></span>
        </div>
        <div class="hero-tile-value">
          <span class="primary">${total > 0 ? `${rate.toFixed(0)}%` : '—'}</span>
          ${total > 0
            ? html`<span class="secondary">· ${total} attempt${total === 1 ? '' : 's'}</span>`
            : nothing}
        </div>
        <meshcore-stacked-bar
          .segments=${segs}
          .legend=${'inline'}>
        </meshcore-stacked-bar>
      </div>
    `;
  }

  /** Format an integer count with thousands separators (e.g., 13,807). */
  private _formatCount(n: number): string {
    if (!Number.isFinite(n)) return '—';
    return Math.round(n).toLocaleString();
  }

  private _renderLocationTile() {
    const lat = this._findEntityIdMatching('latitude');
    const lon = this._findEntityIdMatching('longitude');
    let latVal = lat ? this._readNumber(lat.entity_id) : NaN;
    let lonVal = lon ? this._readNumber(lon.entity_id) : NaN;
    let source: 'entity' | 'fallback' = 'entity';

    // Fallback to caller-supplied lat/lon (typically Contact.adv_lat/lon
    // for managed devices that don't have dedicated location sensors).
    if (!Number.isFinite(latVal) && Number.isFinite(this.fallbackLatitude!)) {
      latVal = this.fallbackLatitude!;
      source = 'fallback';
    }
    if (!Number.isFinite(lonVal) && Number.isFinite(this.fallbackLongitude!)) {
      lonVal = this.fallbackLongitude!;
      source = 'fallback';
    }

    const hasGps = Number.isFinite(latVal) && Number.isFinite(lonVal)
                   && (latVal !== 0 || lonVal !== 0);

    // Nothing to show: no usable coordinates (no GPS entity/fallback, or a
    // 0,0 placeholder). Hide the tile entirely rather than render an empty
    // "—" that just wastes hero space.
    if (!hasGps) return nothing;

    // "Updated X ago" timestamp resolution:
    //  - Entity-based location: HA state's `last_updated` (ISO string).
    //  - Fallback location:    `fallbackUpdated` prop (Unix seconds,
    //    typically Contact.last_advert).
    let updatedDate: Date | null = null;
    if (source === 'entity' && lat) {
      const iso = this.hass?.states[lat.entity_id]?.last_updated;
      if (iso) {
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime())) updatedDate = d;
      }
    } else if (source === 'fallback' && Number.isFinite(this.fallbackUpdated!)) {
      updatedDate = new Date(this.fallbackUpdated! * 1000);
    }
    const updatedText = hasGps && updatedDate
      ? this._formatRelativeTime(updatedDate)
      : '';

    const onClick = () => {
      if (lat) this._fireMoreInfo(lat.entity_id);
    };

    return html`
      <div class="hero-tile" @click=${onClick}>
        <div class="hero-tile-head">
          <span>Location${source === 'fallback'
            ? html`<span style="opacity:0.55;text-transform:none;letter-spacing:0;font-size:10px;margin-left:4px;">via contact</span>`
            : nothing}</span>
        </div>
        <div class="hero-tile-value">
          ${hasGps
            ? html`<span class="coord-pair">
                ${latVal.toFixed(4)}, ${lonVal.toFixed(4)}
              </span>`
            : html`<span class="primary">—</span>`}
        </div>
        ${updatedText
          ? html`<div class="loc-updated">Updated ${updatedText}</div>`
          : nothing}
      </div>
    `;
  }

  /** Format a Date as a short relative-time string like
   *  "just now" / "5 min ago" / "2 h ago" / "3 d ago". */
  private _formatRelativeTime(d: Date): string {
    const deltaSec = (Date.now() - d.getTime()) / 1000;
    if (!Number.isFinite(deltaSec) || deltaSec < 0) return 'just now';
    if (deltaSec < 60)    return 'just now';
    if (deltaSec < 3600)  return `${Math.floor(deltaSec / 60)} min ago`;
    if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} h ago`;
    return `${Math.floor(deltaSec / 86400)} d ago`;
  }

  // _renderMeshNodeCountTile removed: the companion's added-node count moved
  // to the Settings-tab device header (next to Firmware / Key) as a compact
  // "Added nodes" stat — see settings-page.ts.

  // _renderCompanionPowerTile removed: the companion battery slot now uses
  // _renderBatteryTile directly, which renders nothing when there's no
  // battery (no "USB / mains" placeholder tile).

  // Radio Activity tile for the companion node. A managed repeater reports
  // a windowed *_airtime_utilization percentage that _renderRadioActivityTile
  // consumes directly; the companion exposes only RAW cumulative airtime
  // (tx_airtime / rx_airtime, minutes) plus uptime. Derive a lifetime-average
  // duty composition (airtime ÷ uptime) so the companion gets the same tile.
  // Self-hides when airtime or uptime is absent/unavailable (e.g. Self
  // Diagnostics disabled upstream), preserving graceful degradation.
  private _renderCompanionRadioActivityTile() {
    const txAir = this._findEntityIdMatching('tx_airtime');
    const rxAir = this._findEntityIdMatching('rx_airtime');
    const uptimeInfo = this._findByMetric('uptime_hours');
    if ((!txAir && !rxAir) || !uptimeInfo) return nothing;

    const uptimeMin = this._readUptimeMinutes(uptimeInfo);
    if (!Number.isFinite(uptimeMin) || uptimeMin <= 0) return nothing;

    const txMin = txAir ? this._readNumber(txAir.entity_id) : 0;
    const rxMin = rxAir ? this._readNumber(rxAir.entity_id) : 0;
    // If neither airtime value is readable the tile carries no information.
    if (!Number.isFinite(txMin) && !Number.isFinite(rxMin)) return nothing;

    const pct = (m: number) =>
      Number.isFinite(m) ? Math.min(100, Math.max(0, (m / uptimeMin) * 100)) : 0;
    const txN = pct(txMin);
    const rxN = pct(rxMin);
    const idleN = Math.max(0, 100 - txN - rxN);

    // Reuse the repeater airtime-utilisation threshold bands for the dot.
    const txBand = evaluateSensor('tx_airtime_util', txN).band;
    const rxBand = evaluateSensor('rx_airtime_util', rxN).band;
    const dotBand: Band = this._worseBand(txBand, rxBand);

    const segments: StackedBarSegment[] = [
      { value: txN, label: `TX ${txN.toFixed(1)}%`, kind: 'tx' },
      { value: rxN, label: `RX ${rxN.toFixed(1)}%`, kind: 'rx' },
      { value: idleN, label: `Idle ${idleN.toFixed(1)}%`, kind: 'idle' },
    ];

    const totalUsed = txN + rxN;
    const onTxClick = (e: Event) => {
      e.stopPropagation();
      if (txAir) this._fireMoreInfo(txAir.entity_id);
    };
    const onRxClick = (e: Event) => {
      e.stopPropagation();
      if (rxAir) this._fireMoreInfo(rxAir.entity_id);
    };

    return html`
      <div class="hero-tile"
           @click=${() => txAir && this._fireMoreInfo(txAir.entity_id)}>
        <div class="hero-tile-head">
          <span>Radio activity${this._renderInfoTip({
            band: dotBand,
            fillPct: 0,
            tooltip: 'Lifetime-average half-duplex composition: cumulative TX / RX ' +
                     'airtime divided by uptime since the node last booted. The radio ' +
                     'can transmit OR receive, never both. Unlike a managed repeater ' +
                     '(which reports utilisation over the last interval), the companion ' +
                     'exposes only cumulative airtime, so this is a long-run average and ' +
                     'will not reflect short recent bursts.',
          })}</span>
          <span class="status-dot ${dotBand}"></span>
        </div>
        <div class="hero-tile-value">
          <span class="primary">${totalUsed.toFixed(1)}<span class="unit">%</span></span>
        </div>
        <div class="ra-bar-wrap">
          <meshcore-stacked-bar
            .segments=${segments}
            .total=${100}
            .legend=${'none'}>
          </meshcore-stacked-bar>
          <div class="ra-legend">
            ${txAir
              ? html`<span class="ra-legend-item" @click=${onTxClick}>
                  <span class="legend-swatch tx"></span>TX ${txN.toFixed(1)}%
                </span>`
              : html`<span class="ra-legend-item">
                  <span class="legend-swatch tx"></span>TX ${txN.toFixed(1)}%
                </span>`}
            ${rxAir
              ? html`<span class="ra-legend-item" @click=${onRxClick}>
                  <span class="legend-swatch rx"></span>RX ${rxN.toFixed(1)}%
                </span>`
              : html`<span class="ra-legend-item">
                  <span class="legend-swatch rx"></span>RX ${rxN.toFixed(1)}%
                </span>`}
            <span class="ra-legend-item">
              <span class="legend-swatch idle"></span>Idle ${idleN.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    `;
  }

  /** Read an uptime entity's value and normalise to minutes using its
   *  reported unit (companion uptime is days; other flavours may be h/min/s).
   *  Mirrors the unit handling in _evaluateForRow's uptime branch. */
  private _readUptimeMinutes(info: EntityInfo): number {
    const raw = this._readNumber(info.entity_id);
    if (!Number.isFinite(raw)) return NaN;
    const unit = (this.hass?.states[info.entity_id]?.attributes
                  ?.unit_of_measurement as string) ?? '';
    switch (unit) {
      case 'd':   return raw * 1440;
      case 'h':   return raw * 60;
      case 'min': return raw;
      case 's':   return raw / 60;
      default:    return raw / 60; // assume seconds when the unit is unknown
    }
  }

  // ─── Sensor table grouping ────────────────────────────────────────────

  private _buildGroups(consumed: Set<string>): { name: GroupName; rows: TemplateResult[] }[] {
    // Insertion order is the render order. Traffic · totals dropped --
    // Messages Sent / Received / Requests now live in the hero row.
    // Power group also absent (battery + voltage in hero).
    const groups: Record<GroupName, TemplateResult[]> = {
      'Radio · live': [],
      'Radio · configuration': [],
      'Status': [],
      'Identity': [],
    };

    // No radio composite rows: the windowed TX/RX/Idle composition is
    // already shown in the Radio Activity hero tile. Individual airtime
    // entities are filtered upstream in _isHeroDuplicate.

    for (const e of this.entities) {
      if (consumed.has(e.entity_id)) continue;
      if (this._isHeroDuplicate(e)) continue;
      const group = this._groupOf(e);
      groups[group].push(this._renderRow(e));
    }

    // Companion devices (Settings tab) don't benefit from the Radio ·
    // configuration table (frequency / bandwidth / SF / TX power /
    // rate-limiter are all surfaced elsewhere via the integration's
    // device-config dialog) or the Identity catch-all. Drop both groups
    // so the card ends cleanly after the hero row when there's nothing
    // operationally interesting left to show in the table.
    const isCompanion = this.device?.type === 'companion';
    const skipForCompanion: GroupName[] = ['Radio · configuration', 'Identity'];

    return (Object.entries(groups) as [GroupName, TemplateResult[]][])
      .filter(([name, rows]) => {
        if (rows.length === 0) return false;
        if (isCompanion && skipForCompanion.includes(name)) return false;
        return true;
      })
      .map(([name, rows]) => ({ name, rows }));
  }

  /** Return true for entities whose value is already shown in the hero
   *  row or in the device header status badge. Filtering here keeps the
   *  table tight without losing the entity from hidden-sensors-modal
   *  visibility (it's still in `this.entities`, just not rendered). */
  private _isHeroDuplicate(info: EntityInfo): boolean {
    // Battery percentage — primary value in Battery hero tile.
    if (info.metricKey === 'battery_pct') return true;
    // Voltage entities — battery voltage shows alongside battery % in
    // the hero. Other voltage channels (Ch1 Voltage etc.) are also
    // hidden because the user doesn't want them next to the battery
    // voltage already on display. If a future user wants per-channel
    // voltage visibility back, this is the line to flip.
    if (info.sortOrder === 2) return true;
    // SNR / RSSI — shown in Last message strength hero tile.
    if (info.metricKey === 'snr' || info.metricKey === 'rssi') return true;
    // Uptime — promoted to the device header status badge ("Online · 12d 19h").
    if (info.metricKey === 'uptime_hours') return true;
    // Airtime variants — Radio Activity hero tile shows the windowed
    // TX/RX/Idle composition, which is the value of these entities.
    // Hide both the windowed util sensors and the raw cumulative ones.
    if (info.metricKey === 'tx_airtime_util'
        || info.metricKey === 'rx_airtime_util') return true;
    if (info.label === 'Airtime' || info.label === 'RX Airtime') return true;
    return false;
  }

  private _groupOf(info: EntityInfo): GroupName {
    const eid = info.entity_id;
    const so = info.sortOrder;

    // Radio fault flags (boolean problem sensors) live under Status, which
    // is not skipped for companion devices.
    if (info.booleanProblem) return 'Status';

    // Power group dropped. Battery (1) is hero-filtered; voltages (2) go
    // to Status (battery_voltage is hero-filtered, leaving Ch1 Voltage etc.).
    if (so === 2) return 'Status';
    if (so === 6) return 'Radio · configuration';
    if (so === 4 || so === 5 || so === 9 || so === 10 || so === 11 || so === 12)
      return 'Radio · live';
    if (eid.includes('noise_floor') || eid.includes('tx_queue')) return 'Radio · live';

    if (eid.includes('frequency') || eid.includes('bandwidth')
        || eid.includes('spreading_factor') || eid.includes('rate_limiter')) {
      return 'Radio · configuration';
    }

    if (eid.includes('hop_count') || eid.includes('out_path')
        || eid.includes('last_seen') || eid.includes('last_advert')
        || so === 3 || so === 8 || so === 7) {
      return 'Status';
    }

    return 'Identity';
  }

  private _renderGroup(g: { name: GroupName; rows: TemplateResult[] }) {
    return html`
      <div class="group-label">${g.name}</div>
      ${g.rows}
    `;
  }

  // ─── Sensor row ───────────────────────────────────────────────────────

  private _renderRow(info: EntityInfo) {
    // Boolean "problem" rows (companion radio fault flags) — show OK /
    // Detected with a green/red dot instead of a numeric value + bar.
    if (info.booleanProblem) {
      const raw = this.hass?.states[info.entity_id]?.state;
      const unknown = raw === undefined || raw === 'unknown' || raw === 'unavailable';
      const on = raw === 'on';
      const band: Band = unknown ? 'info' : (on ? 'bad' : 'good');
      return html`
        <div class="sensor-item"
             @click=${() => this._fireMoreInfo(info.entity_id)}
             @contextmenu=${(e: MouseEvent) => this._fireContextMenu(e, info)}
             ${longPress(() => this._fireContextMenu(undefined, info))}>
          <span class="status-dot ${band}"></span>
          <span class="si-label">${info.label}</span>
          <span class="si-value">${unknown ? '—' : on ? 'Detected' : 'OK'}</span>
          <span class="si-bar"></span>
        </div>
      `;
    }

    const value = this._readNumber(info.entity_id);
    const stateObj = this.hass?.states[info.entity_id];
    const unit = (stateObj?.attributes?.unit_of_measurement as string) ?? '';
    const ev = info.metricKey ? this._evaluateForRow(info.metricKey, value, info) : null;
    const band = ev?.band ?? 'info';

    // Tooltip resolution: staticTooltip wins when set (lets entities like
    // Temperature carry a metricKey for the bar AND a custom tooltip).
    // Otherwise fall back to the metric-derived tooltip.
    const tooltipText = info.staticTooltip || ev?.tooltip || '';
    const tooltipEv: SensorEval | null = tooltipText
      ? {
          band,
          fillPct: ev?.fillPct ?? 0,
          tooltip: tooltipText,
          source: ev?.source,
        }
      : null;

    const formattedValue = this._formatRowValue(info, value, stateObj?.state);

    return html`
      <div class="sensor-item"
           @click=${() => this._fireMoreInfo(info.entity_id)}
           @contextmenu=${(e: MouseEvent) => this._fireContextMenu(e, info)}
           ${longPress(() => this._fireContextMenu(undefined, info))}>
        <span class="status-dot ${band}"></span>
        <span class="si-label">
          ${info.label}${tooltipEv ? this._renderInfoTip(tooltipEv) : nothing}
        </span>
        <span class="si-value">
          ${formattedValue}${unit ? html`<span class="unit">${unit}</span>` : nothing}
        </span>
        <span class="si-bar">
          ${ev && info.metricKey
            ? html`<meshcore-stat-bar
                .value=${ev.fillPct}
                .min=${0}
                .max=${100}
                .band=${band}>
              </meshcore-stat-bar>`
            : nothing}
        </span>
      </div>
    `;
  }

  /** Apply metric-specific unit conversion for evaluateSensor. */
  private _evaluateForRow(key: MetricKey, raw: number, info: EntityInfo): SensorEval {
    if (key === 'uptime_hours') {
      // The integration's uptime sensor unit varies — the home install
      // reports days (`d`) per the duration device_class default, but
      // some flavours report seconds. Convert based on the live unit.
      const unit = (this.hass?.states[info.entity_id]?.attributes
                    ?.unit_of_measurement as string) ?? '';
      let hours = raw;
      switch (unit) {
        case 'd':   hours = raw * 24; break;
        case 'h':   hours = raw; break;
        case 'min': hours = raw / 60; break;
        case 's':
        default:    hours = raw / 3600; break;
      }
      return evaluateSensor(key, hours);
    }
    if (key === 'temperature') {
      // Threshold bands are defined in °F. Convert Celsius readings up
      // before invoking evaluateSensor so the same band logic works
      // regardless of the entity's reporting unit.
      const unit = (this.hass?.states[info.entity_id]?.attributes
                    ?.unit_of_measurement as string) ?? '';
      const fahrenheit = unit.includes('C') ? (raw * 9 / 5) + 32 : raw;
      return evaluateSensor(key, fahrenheit);
    }
    return evaluateSensor(key, raw);
  }

  // _readDerivedRate removed: the per-tile msg/min text is gone (rates now
  // live in the 48h Message activity chart, which reads recorder statistics
  // for the *_rate sensors via _fetchRateHistory / _deriveRateId).

  // Traffic composite logic moved to the hero tile renderers
  // (_renderMessagesSentTile / _renderMessagesReceivedTile /
  // _renderRequestsTile). The Traffic · totals table group is gone --
  // those rows are now hero tiles.

  // ─── Helpers ──────────────────────────────────────────────────────────

  private _findByMetric(key: MetricKey): EntityInfo | undefined {
    return this.entities.find((e) => e.metricKey === key);
  }

  private _findEntityIdMatching(substr: string): EntityInfo | undefined {
    return this.entities.find((e) => e.entity_id.includes(substr));
  }

  private _findEntityByLabel(label: string): EntityInfo | undefined {
    return this.entities.find((e) => e.label === label);
  }

  private _readNumber(entityId: string): number {
    const s = this.hass?.states[entityId];
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return NaN;
    const n = parseFloat(s.state);
    return Number.isFinite(n) ? n : NaN;
  }

  private _formatNumber(value: number, precision: number): string {
    if (!Number.isFinite(value)) return '—';
    return value.toFixed(precision);
  }

  private _formatRowValue(info: EntityInfo, num: number, raw?: string): string {
    if (raw === 'unavailable' || raw === 'unknown') return '—';
    if (!Number.isFinite(num)) return raw ?? '—';

    const dp = this.hass?.entities?.[info.entity_id]?.display_precision;
    if (dp != null && dp >= 0) return num.toFixed(dp);
    if (raw && raw.includes('.')) return raw;
    return num.toString();
  }

  private _renderInfoTip(ev: SensorEval): TemplateResult | typeof nothing {
    if (!ev.tooltip) return nothing;
    return html`<meshcore-info-tip
      .content=${ev.tooltip}
      .source=${ev.source ?? ''}>
    </meshcore-info-tip>`;
  }

  private _worseBand(a: Band, b: Band): Band {
    const rank: Record<Band, number> = { good: 0, info: 0, warn: 1, bad: 2 };
    return rank[a] >= rank[b] ? a : b;
  }

  private _fireMoreInfo(entityId: string) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  private _fireContextMenu(e: MouseEvent | undefined, info: EntityInfo) {
    e?.preventDefault();
    this.dispatchEvent(new CustomEvent('tile-context-menu', {
      detail: { entityId: info.entity_id, label: info.label },
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-node-summary': NodeSummary;
  }
}
