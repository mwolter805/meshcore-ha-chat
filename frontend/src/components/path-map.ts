import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { ChatMessage, HomeAssistant } from '../types';
import { loadOwnPosition } from '../utils/own-position';
import { formatLength, setHassLengthUnit } from '../utils/units';
import {
  cachedKnownNodes,
  distanceKm,
  formatDistance,
  resolveRoute,
  type RoutePoint,
} from '../utils/path-route';
import {
  NO_MAP_NOTE, TYPE_COLORS, boundsOf, colourMarkers, contactEntityIndex, loadHaMap,
  type HaMapElement,
} from '../utils/ha-map';

type StatesLike = Record<string, { entity_id: string; attributes: Record<string, unknown> }>;

/** The distinct repeater paths of a message, one per heard copy, shortest first. */
export function messagePaths(msg: ChatMessage): string[][] {
  const paths: string[][] = [];
  const seen = new Set<string>();
  for (const entry of msg.rxLogData ?? []) {
    const nodes = entry.path_nodes as string[] | undefined;
    if (!nodes || nodes.length === 0) continue;
    const key = nodes.join('>');
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(nodes);
  }
  return paths.sort((a, b) => a.length - b.length);
}

export function hasMapPath(msg: ChatMessage): boolean {
  return messagePaths(msg).length > 0;
}

/**
 * The route a message took, drawn over Home Assistant's map tiles: the
 * sender (when its position is known), the repeaters of the path, and our
 * companion. Repeaters are matched to known contacts by their hash prefix.
 *
 * Takes `getHass` rather than `hass` so the message bubbles that host it
 * don't re-render on every Home Assistant state change.
 */
@customElement('meshcore-path-map')
export class PathMap extends LitElement {
  @property({ attribute: false }) getHass?: () => HomeAssistant | undefined;
  @property({ attribute: false }) message?: ChatMessage;
  @property({ type: String }) entryId?: string;
  @state() private _me: { lat: number; lon: number } | null = null;
  @state() private _meLoaded = false;
  @state() private _pathIndex = 0;
  /** Home Assistant's map is available: null while loading. */
  @state() private _native: boolean | null = null;
  /** The route last drawn, for the native map (set during render, applied in updated). */
  private _route: RoutePoint[] = [];
  private _nativeKey = '';

  static styles = css`
    :host {
      display: block;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 6px 8px 0;
    }
    .tabs button {
      font: inherit;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      border: 1px solid var(--divider-color, #555);
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
    }
    .tabs button.active {
      background: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }
    .wrap {
      position: relative;
      margin-top: 6px;
      height: 320px;
    }
    .wrap ha-map {
      display: block;
      height: 100%;
    }
    .controls {
      position: absolute;
      top: 6px;
      right: 6px;
    }
    .controls button {
      width: 30px;
      height: 30px;
      border: 1px solid var(--divider-color, #ccc);
      border-radius: 6px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color, #222);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }
    ol {
      margin: 6px 0 8px;
      padding: 0 12px 0 30px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    li {
      margin: 2px 0;
    }
    .prefix {
      font-family: monospace;
    }
    .leg {
      opacity: 0.8;
      font-size: 11px;
    }
    .note {
      padding: 0 12px 8px;
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .note.distance {
      font-size: 12px;
      color: var(--primary-text-color);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (this._native === null) void loadHaMap().then((ok) => { this._native = ok; });
    const hass = this.getHass?.();
    if (hass && !this._meLoaded) {
      setHassLengthUnit((hass as unknown as { config?: { unit_system?: { length?: string } } }).config?.unit_system?.length);
      void loadOwnPosition(hass, this.entryId).then((pos) => {
        this._me = pos;
        this._meLoaded = true;
      });
    }
  }

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has('message')) this._pathIndex = 0;
  }

  render() {
    const hass = this.getHass?.();
    if (!hass || !this.message) return nothing;
    if (!this._meLoaded || this._native === null) return html`<div class="note">Loading...</div>`;
    const paths = messagePaths(this.message);
    if (paths.length === 0) return nothing;
    const index = Math.min(this._pathIndex, paths.length - 1);
    const route = resolveRoute({
      pathNodes: paths[index],
      nodes: cachedKnownNodes(hass.states as unknown as StatesLike),
      me: this._me ? { ...this._me, name: '' } : null,
      outgoing: this.message.isOutgoing,
      senderName: this.message.isOutgoing ? undefined : this.message.sender,
    });
    return html`
      ${paths.length > 1
        ? html`<div class="tabs">
            ${paths.map((p, i) => html`<button class=${i === index ? 'active' : ''}
              @click=${(e: Event) => { e.stopPropagation(); this._pathIndex = i; }}>
              Path ${i + 1} · ${p.length} hop${p.length === 1 ? '' : 's'}
            </button>`)}
          </div>`
        : nothing}
      ${this._renderMap(route)}
      ${this._renderList(route)}
    `;
  }

  // ─── Home Assistant's own map ───────────────────────────────────────

  private _renderMap(route: RoutePoint[]) {
    this._route = route;
    if (!this._native) return html`<div class="note">${NO_MAP_NOTE}</div>`;
    if (!route.some((p) => p.lat !== null && p.lon !== null)) {
      return html`<div class="note">No repeater on this path has a known position.</div>`;
    }
    return html`<div class="wrap"
        @hass-more-info=${(e: Event) => e.stopPropagation()}
        @click=${(e: Event) => e.stopPropagation()}>
      <ha-map></ha-map>
      <div class="controls">
        <button aria-label="Fit route" title="Fit route" @click=${() => this._fitNative()}>⤢</button>
      </div>
    </div>`;
  }

  updated() {
    if (!this._native) return;
    const map = this.renderRoot.querySelector('ha-map') as HaMapElement | null;
    if (!map) return;
    const route = this._route;
    const key = route.map((p) => `${p.prefix}:${p.lat},${p.lon}`).join('|');
    if (key === this._nativeKey) return;
    this._nativeKey = key;
    const index = contactEntityIndex(this.getHass?.());
    const colours = new Map<string, string>();
    const entities: Array<string | Record<string, unknown>> = [];
    let hop = 0;
    for (const p of route) {
      if (p.kind === 'repeater') hop++;
      if (p.kind === 'me' || !p.key) continue;
      const entityId = index.get(p.key);
      if (!entityId || colours.has(entityId)) continue;
      colours.set(entityId, p.kind === 'sender' ? '#43a047' : TYPE_COLORS[2]);
      // Repeaters by hop number, the sender by its name, as in the list below.
      entities.push({ entity_id: entityId, label_mode: 'name', name: p.kind === 'repeater' ? String(hop) : (p.name || 'Sender') });
    }
    map.clusterMarkers = false;
    map.autoFit = false;
    map.entities = entities;
    const points = route
      .filter((p) => p.lat !== null && p.lon !== null)
      .map((p) => ({ point: [p.lat!, p.lon!] as [number, number], tooltip: p.name || p.prefix || 'You' }));
    map.paths = points.length > 1 ? [{ points, color: '#d32f2f' }] : [];
    void colourMarkers(map, (id) => colours.get(id));
    this._fitNative();
  }

  private _fitNative() {
    const map = this.renderRoot.querySelector('ha-map') as HaMapElement | null;
    const bounds = boundsOf(this._route
      .filter((p) => p.lat !== null && p.lon !== null)
      .map((p) => ({ lat: p.lat!, lon: p.lon! })));
    if (map && bounds) map.fitBounds?.(bounds, { zoom: 14, pad: 0.3 });
  }

  private _renderList(route: RoutePoint[]) {
    const uncertain = route.some((p) => p.ambiguous);
    const repeaters = route.filter((p) => p.kind === 'repeater');
    // Each repeater's leg from the previous repeater with a known position.
    let prev: RoutePoint | null = null;
    const legs = repeaters.map((p) => {
      if (p.lat === null || p.lon === null) return null;
      const leg = prev ? distanceKm(prev.lat!, prev.lon!, p.lat, p.lon) : null;
      prev = p;
      return leg;
    });
    // Straight line between the end repeaters, and the legs added up.
    const first = repeaters[0];
    const last = repeaters[repeaters.length - 1];
    const total = repeaters.length >= 2 && first.lat !== null && first.lon !== null && last.lat !== null && last.lon !== null
      ? {
          km: distanceKm(first.lat, first.lon, last.lat, last.lon),
          approx: first.ambiguous || last.ambiguous,
          routeKm: legs.reduce<number>((sum, leg) => sum + (leg ?? 0), 0),
          routeApprox: repeaters.some((p) => p.ambiguous || p.lat === null),
        }
      : null;
    return html`
      <ol>
        ${repeaters.map((p, i) => {
          const leg = legs[i];
          return html`<li>
            <span class="prefix">${p.prefix}</span>
            ${p.name
              ? html` ${p.name}`
              : p.leftOut ? ' – probably a repeater not in your contacts' : ' – no known position'}${p.ambiguous && !p.leftOut ? ' (?)' : ''}${leg !== null
              ? html` <span class="leg">+${formatLength(leg)}</span>`
              : nothing}
          </li>`;
        })}
      </ol>
      ${total ? html`<div class="note distance">${formatDistance(total)}</div>` : nothing}
      ${uncertain
        ? html`<div class="note">(?) Several known repeaters share this prefix; the one that fits the route best is shown.</div>`
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-path-map': PathMap;
  }
}
