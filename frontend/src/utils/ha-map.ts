/**
 * Home Assistant's own map component (`ha-map`), as used by its Map card
 * and Map dashboard: vector OpenStreetMap tiles, the user's theme, native
 * markers and clustering.
 *
 * `ha-map` is loaded lazily by Home Assistant, only when a Map card is
 * used. Creating a Map card through the documented card helpers loads it.
 * It is not a documented API for custom panels, so everything here is
 * defensive: if it can't be loaded, the panel shows a note instead.
 */
import type { HomeAssistant } from '../types';

const LOAD_TIMEOUT_MS = 8000;

export const NO_MAP_NOTE = 'The map needs Home Assistant 2026.10 or newer.';

let loading: Promise<boolean> | null = null;

/** Resolves true once `ha-map` is defined, false if it can't be loaded. */
export function loadHaMap(): Promise<boolean> {
  if (customElements.get('ha-map')) return Promise.resolve(true);
  loading ??= (async () => {
    try {
      const helpers = await (window as unknown as {
        loadCardHelpers?: () => Promise<{ createCardElement: (c: Record<string, unknown>) => HTMLElement }>;
      }).loadCardHelpers?.();
      if (!helpers) return false;
      // Creating the card imports its code, which defines ha-map.
      helpers.createCardElement({ type: 'map', entities: [] });
      return await Promise.race([
        customElements.whenDefined('ha-map').then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), LOAD_TIMEOUT_MS)),
      ]);
    } catch {
      return false;
    }
  })();
  return loading;
}

/** The parts of `ha-map` this panel uses. */
export interface HaMapElement extends HTMLElement {
  entities?: Array<string | Record<string, unknown>>;
  paths?: Array<{ points: Array<{ point: [number, number]; tooltip?: string }>; color?: string }>;
  clusterMarkers?: boolean;
  autoFit?: boolean;
  updateComplete?: Promise<unknown>;
  fitBounds?: (bounds: [[number, number], [number, number]], options?: { zoom?: number; pad?: number }) => void;
  _entityMarkers?: Map<string, HTMLElement>;
  _createClusterBubble?: unknown;
}

/** Single node markers, smaller than Home Assistant's default 48px so groups stand out. */

export const TYPE_COLORS: Record<number, string> = {
  1: '#42a5f5', // companion
  2: '#fb8c00', // repeater
  3: '#ab47bc', // room server
  4: '#66bb6a', // sensor
};

/**
 * Groups drawn as a plain circle with the number of nodes in it, instead of
 * Home Assistant's row of mini markers, so the whole group is one tap
 * target. Tapping it zooms in (Home Assistant's own behaviour).
 */
export function useCountClusters(map: HaMapElement): void {
  map._createClusterBubble = (items: unknown[]) => {
    const n = items.length;
    // Always larger than a single node's marker (--ha-marker-size: 30px).
    const size = Math.round(Math.min(56, 36 + Math.log2(Math.max(1, n)) * 4));
    const el = document.createElement('div');
    el.textContent = n > 999 ? '999+' : String(n);
    el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;`
      + 'background:var(--primary-color,#03a9f4);color:#fff;'
      + `font:600 ${n > 99 ? 12 : 14}px sans-serif;display:flex;align-items:center;justify-content:center;`
      + 'box-shadow:0 0 0 3px rgba(3,169,244,.35),0 1px 4px rgba(0,0,0,.4);cursor:pointer';
    return { element: el, size: [size, size], anchor: [size / 2, size / 2] };
  };
}

/**
 * Colour each marker's border by node type. `ha-map` ignores an entity's
 * `color` for plain markers, but its markers read --ha-marker-color.
 * Markers are created once the map engine has loaded, which can be well
 * after the entities are set, so keep applying until the set of markers
 * stops changing. Marker elements are reused, so the colour sticks.
 */
export async function colourMarkers(
  map: HaMapElement,
  colourFor: (entityId: string) => string | undefined,
): Promise<void> {
  let lastSize = -1;
  let stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, i === 0 ? 0 : 250));
    if (!map.isConnected) return;
    const markers = map._entityMarkers;
    if (!markers) continue;
    for (const [entityId, el] of markers) {
      const colour = colourFor(entityId);
      if (!colour || el.style.getPropertyValue('--ha-marker-color') === colour) continue;
      el.style.setProperty('--ha-marker-color', colour);
      el.style.setProperty('--ha-marker-border-width', '3px');
    }
    stable = markers.size > 0 && markers.size === lastSize ? stable + 1 : 0;
    lastSize = markers.size;
  }
}

/** Contact entities by public key (lower case), from Home Assistant's states. */
export function contactEntityIndex(hass: HomeAssistant | undefined): Map<string, string> {
  const index = new Map<string, string>();
  for (const [entityId, state] of Object.entries(hass?.states ?? {})) {
    if (!entityId.startsWith('binary_sensor.meshcore_') || !entityId.endsWith('_contact')) continue;
    const key = (state.attributes as Record<string, unknown>).public_key;
    if (typeof key === 'string') index.set(key.toLowerCase(), entityId);
  }
  return index;
}

/** Bounds of points, as ha-map's fitBounds takes them. */
export function boundsOf(points: Array<{ lat: number; lon: number }>): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
}
