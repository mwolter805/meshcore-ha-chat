/**
 * Turn a message's path (repeater hash prefixes from rx_log_data) into
 * points on a map, using the positions the repeaters advertise.
 *
 * A path lists the repeaters a packet went through as the first bytes of
 * their public keys, from the sender's side to ours. With 2-byte prefixes
 * almost every prefix names one repeater; with 1-byte prefixes many do.
 * When several known nodes share a prefix, the point is marked as
 * uncertain and the candidates are chosen together: of all combinations,
 * the one whose route from us to the sender (when its position is known)
 * is shortest, with long legs counting more than short ones. A radio
 * route does not jump far away and back, so this beats taking each hop's
 * nearest candidate one by one, where one wrong guess drags the rest.
 */

import { formatLength } from './units';

export interface MapNode {
  key: string;
  name: string;
  lat: number;
  lon: number;
  type: number;
}

export type RouteKind = 'sender' | 'repeater' | 'me';

export interface RoutePoint {
  kind: RouteKind;
  /** Hash prefix as shown in the path, upper case; '' for sender and me. */
  prefix: string;
  name: string;
  lat: number | null;
  lon: number | null;
  /** More than one known node shares the prefix. */
  ambiguous: boolean;
  /** Public key of the contact placed here, when there is one. */
  key?: string;
  /** Known nodes share the prefix, but all lie off the route: probably a repeater we don't know. */
  leftOut?: boolean;
}

interface StateLike {
  entity_id: string;
  attributes: Record<string, unknown>;
}

function coordinate(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Contacts with a public key and an advertised position, from Home Assistant's states. */
export function knownNodes(states: Record<string, StateLike>): MapNode[] {
  const nodes: MapNode[] = [];
  for (const [entityId, state] of Object.entries(states)) {
    if (!entityId.startsWith('binary_sensor.meshcore_') || !entityId.endsWith('_contact')) continue;
    const a = state.attributes;
    const key = typeof a.public_key === 'string' ? a.public_key.toLowerCase() : '';
    const lat = coordinate(a.adv_lat ?? a.latitude);
    const lon = coordinate(a.adv_lon ?? a.longitude);
    if (!key || lat === null || lon === null) continue;
    nodes.push({
      key,
      name: String(a.adv_name ?? a.friendly_name ?? key.slice(0, 6)),
      lat,
      lon,
      type: Number(a.type ?? 0),
    });
  }
  return nodes;
}

/** Distance in kilometres. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Known nodes a path prefix can stand for; repeaters and room servers first, as they forward packets. */
function candidatesFor(prefix: string, nodes: MapNode[]): MapNode[] {
  const p = prefix.toLowerCase();
  const forwarders = nodes.filter((n) => n.key.startsWith(p) && (n.type === 2 || n.type === 3));
  return forwarders.length ? forwarders : nodes.filter((n) => n.key.startsWith(p));
}

/** Cost of one leg of `hops` hops: each hop its length, hops over about 100 km counting ever more. */
function legCost(a: { lat: number; lon: number }, b: { lat: number; lon: number }, hops = 1): number {
  const d = distanceKm(a.lat, a.lon, b.lat, b.lon) / hops;
  return hops * (d + (d * d) / 100);
}

/**
 * What leaving a hop out costs, by prefix length: for a 1-byte prefix about
 * the cost of one 100 km hop, for a longer one three times that. Many
 * repeaters on a path are not among our contacts, and the one known node
 * with the same prefix may be far away; dropping it is then more likely
 * right than a long jump there and back. A 2-byte prefix is far more
 * often the node we know, so leaving it out costs more.
 */
export function skipCost(prefix: string): number {
  return prefix.length <= 2 ? 200 : 600;
}

/**
 * Cost per kilometre of coming back towards us: walking the path from us
 * outwards, each repeater should be at least as far from us as the one
 * before, give or take. A repeater near us between ones far away is a
 * wrong guess more likely than a route that turned back.
 */
const BACKTRACK_COST = 2;

interface ChainState {
  pos: { lat: number; lon: number } | null;
  /** Distance from us of the last placed node, and the hop it is on (-1: us). */
  fromStart: number;
  layer: number;
  cost: number;
  picks: Array<MapNode | null>;
}

/**
 * Choose one candidate per hop so that the chain start → hops → end is
 * cheapest: short hops, no turning back towards the start. Hops without
 * candidates are left out; a hop may be left out too, at its cost in
 * skipCosts, as a repeater we don't know. A leg across left-out hops
 * counts as that many hops.
 */
export function chooseCandidates(
  layers: MapNode[][],
  start: { lat: number; lon: number } | null,
  end: { lat: number; lon: number } | null,
  skipCosts: number[] = [],
): Array<MapNode | null> {
  // One state per last placed node (and its hop): the cheapest chain that ends there.
  let states = new Map<string, ChainState>([['', { pos: start, fromStart: 0, layer: -1, cost: 0, picks: [] }]]);
  layers.forEach((layer, k) => {
    const next = new Map<string, ChainState>();
    const offer = (key: string, state: ChainState) => {
      const old = next.get(key);
      if (!old || state.cost < old.cost) next.set(key, state);
    };
    for (const [key, s] of states) {
      for (const c of layer) {
        const fromStart = start ? distanceKm(start.lat, start.lon, c.lat, c.lon) : 0;
        const back = start && s.layer >= 0 ? Math.max(0, s.fromStart - fromStart) * BACKTRACK_COST : 0;
        offer(`${k}:${c.key}`, {
          pos: { lat: c.lat, lon: c.lon },
          fromStart,
          layer: k,
          cost: s.cost + (s.pos ? legCost(s.pos, c, k - s.layer) : 0) + back,
          picks: [...s.picks, c],
        });
      }
      const skip = layer.length === 0 ? 0 : skipCosts[k] ?? Infinity;
      if (Number.isFinite(skip)) {
        offer(key, { ...s, cost: s.cost + skip, picks: [...s.picks, null] });
      }
    }
    states = next;
  });
  let best: ChainState | null = null;
  let bestCost = Infinity;
  for (const s of states.values()) {
    const total = s.cost + (end && s.pos ? legCost(s.pos, end, layers.length - s.layer) : 0);
    if (total < bestCost) {
      bestCost = total;
      best = s;
    }
  }
  return best ? best.picks : layers.map(() => null);
}

/**
 * Points of a path in travel order. A received message goes from the
 * sender through the repeaters to us; our own message goes from us
 * through the repeaters that were heard repeating it.
 */
export function resolveRoute(options: {
  pathNodes: string[];
  nodes: MapNode[];
  me: { lat: number; lon: number; name: string } | null;
  outgoing: boolean;
  senderName?: string;
}): RoutePoint[] {
  const { pathNodes, nodes, me, outgoing, senderName } = options;
  const meNear = me ? { lat: me.lat, lon: me.lon } : null;
  const sender = !outgoing && senderName ? nodes.find((n) => n.name === senderName) : undefined;
  // Chain from our end: us, the repeaters nearest to us first, then the sender.
  const order = outgoing ? pathNodes.map((_, i) => i) : pathNodes.map((_, i) => pathNodes.length - 1 - i);
  const layers = order.map((i) => candidatesFor(pathNodes[i], nodes));
  const skips = order.map((i) => skipCost(pathNodes[i]));
  const picked = chooseCandidates(layers, meNear, sender ? { lat: sender.lat, lon: sender.lon } : null, skips);
  const placed: RoutePoint[] = new Array(pathNodes.length);
  order.forEach((i, k) => {
    const node = picked[k];
    placed[i] = {
      kind: 'repeater',
      prefix: pathNodes[i].toUpperCase(),
      name: node?.name ?? '',
      lat: node?.lat ?? null,
      lon: node?.lon ?? null,
      ambiguous: layers[k].length > 1,
      ...(node ? { key: node.key } : {}),
      ...(node === null && layers[k].length > 0 ? { leftOut: true } : {}),
    };
  });
  const mePoint: RoutePoint = {
    kind: 'me',
    prefix: '',
    name: me?.name ?? '',
    lat: me?.lat ?? null,
    lon: me?.lon ?? null,
    ambiguous: false,
  };
  if (outgoing) return [mePoint, ...placed];
  const senderPoint: RoutePoint = {
    kind: 'sender',
    prefix: '',
    name: senderName ?? '',
    lat: sender?.lat ?? null,
    lon: sender?.lon ?? null,
    ambiguous: false,
    ...(sender ? { key: sender.key } : {}),
  };
  return [senderPoint, ...placed, mePoint];
}

// ── Contacts from Home Assistant's states ───────────────────────────────

const nodeCache = new WeakMap<object, MapNode[]>();

/** knownNodes, computed once per states object. */
export function cachedKnownNodes(states: Record<string, StateLike>): MapNode[] {
  let nodes = nodeCache.get(states);
  if (!nodes) {
    nodes = knownNodes(states);
    nodeCache.set(states, nodes);
  }
  return nodes;
}

/** "↔ 241 km (∑ 530 km)": straight line between the end repeaters, then the route's length. */
export function formatDistance(d: { km: number; approx: boolean; routeKm: number; routeApprox: boolean }): string {
  const straight = `↔ ${formatLength(d.km, d.approx)}`;
  // With two repeaters the route is the straight line.
  return d.routeKm - d.km > 0.5 ? `${straight} (∑ ${formatLength(d.routeKm, d.routeApprox)})` : straight;
}
