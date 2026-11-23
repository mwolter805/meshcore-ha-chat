import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Contact, HomeAssistant } from '../types';
import {
  NO_MAP_NOTE, TYPE_COLORS, boundsOf, colourMarkers, contactEntityIndex, loadHaMap, useCountClusters,
  type HaMapElement,
} from '../utils/ha-map';

const GROUPS_STORAGE_KEY = 'meshcore-nodes-map-groups';

function storedGroups(): boolean {
  try {
    return localStorage.getItem(GROUPS_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface Placed {
  node: Contact;
  lat: number;
  lon: number;
}

function position(node: Contact): Placed | null {
  const lat = Number(node.adv_lat);
  const lon = Number(node.adv_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return { node, lat, lon };
}

/**
 * Nodes with a known position on Home Assistant's own map (`ha-map`).
 * Each node is a contact entity, labelled with its 2-character key prefix
 * and bordered in its type's colour. Nearby nodes group into a numbered
 * circle (tap to zoom in), which can be turned off. A tap on a node fires
 * `node-selected` instead of opening Home Assistant's entity popup.
 */
@customElement('meshcore-nodes-map')
export class NodesMap extends LitElement {
  @property({ attribute: false }) nodes: Contact[] = [];
  @property({ attribute: false }) home: { lat: number; lon: number } | null = null;
  @property({ type: Boolean }) loading = false;
  /** Used for the entity lookup only, so state changes don't re-render the map. */
  @property({ attribute: false, hasChanged: (value: unknown, old: unknown) => !old && !!value }) hass?: HomeAssistant;

  /** Home Assistant's map is available: null while loading. */
  @state() private _available: boolean | null = null;
  /** Group nearby nodes into numbered circles; off shows every node. Remembered per browser. */
  @state() private _groups = storedGroups();
  private _ready = false;
  /** Fitted once to real nodes; later node changes (filters, adding a contact) keep the view. */
  private _fitted = false;
  /** Contact entity id → node, for taps on markers. */
  private _entityNodes = new Map<string, Contact>();
  /** Nodes drawn on the map (those with a position and a Home Assistant entity). */
  @state() private _shown = 0;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .wrap {
      position: relative;
      flex: 1;
      min-height: 240px;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
    }
    ha-map {
      flex: 1;
      display: block;
      height: 100%;
      /* Single nodes smaller than groups; read by ha-map. */
      --ha-marker-size: 30px;
    }
    .note {
      margin: auto;
      padding: 16px;
      color: var(--secondary-text-color);
      font-size: 13px;
      text-align: center;
    }
    .controls {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .controls button {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid rgba(0, 0, 0, 0.25);
      background: rgba(255, 255, 255, 0.92);
      color: #222;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }
    .controls button.groups {
      font-size: 16px;
    }
    .controls button.groups.on {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }
    .legend {
      flex: none;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      padding: 6px 4px 0;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: -1px;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (this._available === null) void loadHaMap().then((ok) => { this._available = ok; });
  }

  updated(changed: Map<string, unknown>) {
    const map = this._map();
    if (!map) return;
    const first = !this._ready;
    if (first) {
      useCountClusters(map);
      map.autoFit = false;
      this._ready = true;
    }
    if (first || changed.has('_groups')) map.clusterMarkers = this._groups;
    if (first || changed.has('nodes')) this._drawNodes(map);
  }

  private _map(): HaMapElement | null {
    return this.renderRoot.querySelector('ha-map') as HaMapElement | null;
  }

  private _placed(): Placed[] {
    return this.nodes.map(position).filter((p): p is Placed => p !== null);
  }

  private _drawNodes(map: HaMapElement) {
    const index = contactEntityIndex(this.hass);
    const colours = new Map<string, string>();
    this._entityNodes = new Map();
    const entities: Array<string | Record<string, unknown>> = [];
    for (const p of this._placed()) {
      const key = String(p.node.public_key ?? '').toLowerCase();
      const entityId = index.get(key);
      if (!entityId) continue;
      this._entityNodes.set(entityId, p.node);
      colours.set(entityId, TYPE_COLORS[p.node.type] ?? '#9e9e9e');
      // The 2-character key prefix (first byte), as repeaters appear in message routes.
      entities.push({ entity_id: entityId, label_mode: 'name', name: key.slice(0, 2) });
    }
    map.entities = entities;
    this._shown = this._entityNodes.size;
    void colourMarkers(map, (id) => colours.get(id));
    if (!this._fitted && this._entityNodes.size > 0) {
      this._fitted = true;
      this._fit();
    }
  }

  /**
   * Fit the bulk of the nodes and home: a few far away ones (another
   * country, a wrong position) would otherwise zoom out to a continent.
   */
  private _fit() {
    let pts = this._placed().map((p) => ({ lat: p.lat, lon: p.lon }));
    if (pts.length >= 20) {
      const q = (vals: number[], f: number) => vals.slice().sort((a, b) => a - b)[Math.floor(f * (vals.length - 1))];
      const lats = pts.map((p) => p.lat);
      const lons = pts.map((p) => p.lon);
      const [la0, la1, lo0, lo1] = [q(lats, 0.02), q(lats, 0.98), q(lons, 0.02), q(lons, 0.98)];
      pts = pts.filter((p) => p.lat >= la0 && p.lat <= la1 && p.lon >= lo0 && p.lon <= lo1);
    }
    if (this.home) pts.push(this.home);
    const bounds = boundsOf(pts);
    if (bounds) this._map()?.fitBounds?.(bounds, { zoom: 15, pad: 0.1 });
  }

  private _toggleGroups() {
    this._groups = !this._groups;
    try {
      localStorage.setItem(GROUPS_STORAGE_KEY, this._groups ? 'on' : 'off');
    } catch {
      // localStorage full or unavailable
    }
  }

  /** A tap on a node marker opens our node dialog instead of Home Assistant's entity popup. */
  private _onMoreInfo(e: CustomEvent<{ entityId?: string }>) {
    e.stopPropagation();
    const node = e.detail?.entityId ? this._entityNodes.get(e.detail.entityId) : undefined;
    if (node) {
      this.dispatchEvent(new CustomEvent('node-selected', { detail: { node }, bubbles: true, composed: true }));
    }
  }

  render() {
    if (this._available === null) return html`<div class="wrap"></div>`;
    if (!this._available) return html`<div class="wrap"><div class="note">${NO_MAP_NOTE}</div></div>`;
    return html`
      <div class="wrap" @hass-more-info=${this._onMoreInfo}>
        <ha-map></ha-map>
        <div class="controls">
          <button aria-label="Show all" title="Show all" @click=${() => this._fit()}>⤢</button>
          <button class="groups ${this._groups ? 'on' : ''}" aria-pressed=${this._groups}
            title=${this._groups ? 'Groups on: tap to show every node' : 'Groups off: tap to group nearby nodes'}
            @click=${() => this._toggleGroups()}>${this._groups ? '◉' : '•'}</button>
        </div>
      </div>
      <div class="legend">
        <span><span class="dot" style="background:${TYPE_COLORS[2]}"></span>Repeater</span>
        <span><span class="dot" style="background:${TYPE_COLORS[1]}"></span>Companion</span>
        <span><span class="dot" style="background:${TYPE_COLORS[3]}"></span>Room server</span>
        <span><span class="dot" style="background:${TYPE_COLORS[4]}"></span>Sensor</span>
        <span>${this.loading
          ? 'Loading...'
          : `${this._shown} of ${this.nodes.length} nodes have a known position`}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-nodes-map': NodesMap;
  }
}
