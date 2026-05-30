// Shared meshcore entity classifier used by both settings-page and devices-page.
//
// Strategy:
//   1. Exclude connectivity binary_sensors (peer contact discovery entities).
//   2. Exclude meshcore-specific status/control entity-id patterns.
//   3. Match HA original_device_class for categories that have one.
//   4. Fall back to entity_id substring for meshcore-specific categories
//      (SNR, RSSI, Airtime, Channel Util, Contacts count) that have no
//      standard HA device_class.
//   5. Generic fallback: sensor.meshcore_* → label = friendly name, sortOrder 99.
//
// Step 1 is the defect-fix rationale for this file: previously, contact
// binary_sensors were not filtered, and a name-substring match on "temp"
// produced false-positive Temperature tiles for any peer whose advertised
// name contained that 4-letter sequence.
//
// `metricKey` is an optional tag that the node-summary card uses to look
// up threshold bands via evaluateSensor(). Branches whose value is
// informational-only (TX power, raw airtime seconds, voltage,
// temperature) intentionally leave metricKey unset — the bar-colour
// driver is battery_percentage rather than voltage, and tx_power / sf /
// bw / frequency are treated as informational-only.

import type { MetricKey } from './sensor-thresholds';

export interface EntityInfo {
  entity_id: string;
  label: string;
  icon: string;
  colorScheme: 'battery' | 'signal' | 'neutral';
  sortOrder: number;
  /** Optional threshold-table key. Undefined for informational metrics
   *  that don't drive a coloured band (voltage, TX power, temperature,
   *  raw airtime seconds, contacts count, generic catch-all). */
  metricKey?: MetricKey;
  /** Optional informational tooltip for entities that don't have a
   *  threshold band but should still surface explanatory text via the
   *  ⓘ icon (e.g., Temperature -- ambient context-dependent, no band).
   *  When a metricKey is set, evaluateSensor's tooltip wins. */
  staticTooltip?: string;
  /** True for boolean "problem" binary_sensors (the companion's radio
   *  fault flags). node-summary renders these as OK/Detected rows with a
   *  green/red dot rather than a numeric value + bar. */
  booleanProblem?: boolean;
}

export interface MeshcoreRegistryResult {
  /** meshcore device identifier → HA device_id */
  meshcoreDeviceMap: Record<string, string>;
  /** HA device_id → classified, sorted entities */
  deviceEntities: Record<string, EntityInfo[]>;
}

/**
 * Classify a meshcore sensor or binary_sensor entity into a tile EntityInfo,
 * or return null if the entity should not be rendered as a tile.
 */
export function classifyEntity(entity: any): EntityInfo | null {
  const eid: string = entity.entity_id;
  // Read device_class from any of the three places HA might surface it:
  //   - entity.original_device_class (registry; integration-declared, immutable)
  //   - entity.device_class (registry; user override, often null)
  //   - entity._stateDeviceClass (injected by loadMeshcoreEntityRegistry from
  //     hass.states[eid].attributes.device_class — the only one that is
  //     consistently populated on this HA install at the time of writing).
  // Reading from all three keeps the classifier correct across HA versions.
  const dc: string | null = entity.original_device_class
                         ?? entity.device_class
                         ?? entity._stateDeviceClass
                         ?? null;

  // --- Step 0: allow the companion's self-diagnostic radio fault flags ---
  // These are `problem` binary_sensors decoded from the STATS_CORE error
  // bitmask (companion-only). They must be allow-listed BEFORE the blanket
  // meshcore binary_sensor exclusion in Step 1. Latching since boot; rendered
  // as OK/Detected rows (booleanProblem) and grouped under Status.
  if (eid.startsWith('binary_sensor.meshcore_')
      && /_err_(pool_full|cad_timeout|rx_timeout)_/.test(eid)) {
    const label = eid.includes('err_pool_full') ? 'Radio Fault: Packet Pool'
                : eid.includes('err_cad_timeout') ? 'Radio Fault: CAD Timeout'
                : 'Radio Fault: RX-Start Timeout';
    return { entity_id: eid, label, icon: 'alert',
             colorScheme: 'neutral', sortOrder: 13, booleanProblem: true };
  }

  // --- Step 1: exclude peer-contact binary_sensors ---
  // All meshcore binary_sensors today are contact-discovery entities with
  // device_class="connectivity". The defensive second check catches any
  // future binary_sensor that ships without a device_class; if/when a real
  // tile-worthy binary_sensor is added to the integration, add an explicit
  // allow-case above this line.
  if (eid.startsWith('binary_sensor.meshcore_') && dc === 'connectivity') return null;
  if (eid.startsWith('binary_sensor.meshcore_')) return null;

  // --- Step 2: meshcore-specific status/control exclusions (entity_id substrings) ---
  // *_rate sensors are derived counters (per-minute deltas of the totals).
  // The new node-summary card uses TOTALS via composite stacked bars and
  // surfaces the cumulative msg/min rate as an annotation, so the rate
  // sensors would be redundant noise. The entity_id pattern is
  // `..._<sensor>_rate_<device-name-suffix>` (the device-name suffix is
  // appended by upstream's entity registration), so endsWith('_rate')
  // misses them — match the `_rate_` infix instead.
  if (eid.includes('_rate_')) return null;
  // full_evts is an internal counter (full-buffer events on TX queue) the
  // user has no actionable signal on -- removed per iter8 review.
  if (eid.includes('full_evts')) return null;
  if (eid.includes('node_status') || eid.includes('companion_prefix')
      || eid.includes('request_rate') || eid.includes('delivery')
      || eid.includes('path_') || eid.includes('neighbor_')) return null;

  // --- Step 3: classify by HA device_class, with entity_id substring as a
  //     defensive parallel match. Some HA installs do not surface
  //     original_device_class on the entity_registry/list response; the
  //     entity_id pattern is the project-specific fallback. ---
  if (dc === 'battery' || eid.includes('battery_percentage')) {
    return { entity_id: eid, label: 'Battery', icon: 'battery',
             colorScheme: 'battery', sortOrder: 1,
             metricKey: 'battery_pct' };
  }
  if (dc === 'voltage' || eid.includes('battery_voltage')
      || eid.includes('_voltage') || eid.includes('cv_voltage')) {
    // Voltage is informational only. No metricKey — chemistry varies
    // per board and the integration doesn't expose chemistry per node.
    return { entity_id: eid, label: 'Voltage', icon: 'power',
             colorScheme: 'neutral', sortOrder: 2 };
  }
  if (dc === 'duration' || eid.includes('uptime')) {
    // Uptime: state value's unit varies by integration (HA defaults vary
    // between seconds/hours/days). node-summary._evaluateForRow reads the
    // unit_of_measurement state attribute to convert to hours before calling
    // evaluateSensor.
    return { entity_id: eid, label: 'Uptime', icon: 'clock',
             colorScheme: 'neutral', sortOrder: 3,
             metricKey: 'uptime_hours' };
  }
  if (dc === 'signal_strength' || eid.includes('tx_power')) {
    // Currently only TX Power uses signal_strength in meshcore. TX Power
    // is informational (regulatory ceilings vary per region) — no metricKey.
    return { entity_id: eid, label: 'TX Power', icon: 'power',
             colorScheme: 'neutral', sortOrder: 6 };
  }
  if (dc === 'temperature' || eid.includes('_temperature')) {
    return { entity_id: eid, label: 'Temperature', icon: 'thermometer',
             colorScheme: 'neutral', sortOrder: 7,
             metricKey: 'temperature',
             staticTooltip:
               'Ambient temperature reported by the node. Informational; ' +
               'no threshold band -- expected ranges depend heavily on ' +
               'where the device is mounted.' };
  }

  // --- Step 4: entity_id substring fallback (categories without a device_class
  //     OR cases where device_class lookup failed in Step 3). Order matters:
  //     more specific substrings before less specific. ---

  // Airtime utilization variants come BEFORE raw airtime; the
  // _utilization sensors are the threshold-banded metrics. Differentiate
  // RX vs TX explicitly so the table shows distinct rows instead of four
  // "Airtime" lines.
  if (eid.includes('rx_airtime_utilization')) {
    return { entity_id: eid, label: 'RX Airtime Util', icon: 'chart',
             colorScheme: 'neutral', sortOrder: 10,
             metricKey: 'rx_airtime_util' };
  }
  if (eid.includes('airtime_utilization')) {
    return { entity_id: eid, label: 'TX Airtime Util', icon: 'chart',
             colorScheme: 'neutral', sortOrder: 10,
             metricKey: 'tx_airtime_util' };
  }
  if (eid.includes('rx_airtime')) {
    // Raw RX airtime (total seconds receiving). Informational — no band.
    return { entity_id: eid, label: 'RX Airtime', icon: 'chart',
             colorScheme: 'neutral', sortOrder: 9 };
  }
  if (eid.includes('airtime')) {
    // Raw TX airtime (total seconds transmitting). Informational — no band.
    return { entity_id: eid, label: 'Airtime', icon: 'chart',
             colorScheme: 'neutral', sortOrder: 9 };
  }

  if (eid.includes('snr') && !eid.includes('neighbor')) {
    return { entity_id: eid, label: 'SNR', icon: 'signal',
             colorScheme: 'signal', sortOrder: 4,
             metricKey: 'snr' };
  }
  if (eid.includes('rssi')) {
    return { entity_id: eid, label: 'RSSI', icon: 'signal',
             colorScheme: 'signal', sortOrder: 5,
             metricKey: 'rssi' };
  }
  if (eid.includes('noise_floor')) {
    return { entity_id: eid, label: 'Noise Floor', icon: 'signal',
             colorScheme: 'signal', sortOrder: 11,
             metricKey: 'noise_floor' };
  }
  if (eid.includes('tx_queue_len')) {
    return { entity_id: eid, label: 'TX Queue Length', icon: 'counter',
             colorScheme: 'neutral', sortOrder: 12,
             metricKey: 'tx_queue_len' };
  }
  if (eid.includes('contact_count')) {
    return { entity_id: eid, label: 'Contacts', icon: 'counter',
             colorScheme: 'neutral', sortOrder: 8 };
  }
  if (eid.includes('channel_util')) {
    return { entity_id: eid, label: 'Channel Util', icon: 'chart',
             colorScheme: 'neutral', sortOrder: 10,
             metricKey: 'channel_util' };
  }

  // --- Step 5: generic meshcore sensor catch-all ---
  if (eid.startsWith('sensor.meshcore_')) {
    const friendlyName = entity.original_name || entity.name || eid.split('.')[1];
    return { entity_id: eid, label: friendlyName, icon: '',
             colorScheme: 'neutral', sortOrder: 99 };
  }
  return null;
}

/**
 * Load and classify meshcore entities from the HA registry.
 * Returns (meshcoreDeviceMap, deviceEntities) suitable for assignment to
 * the page's reactive properties.
 */
export async function loadMeshcoreEntityRegistry(hass: any): Promise<MeshcoreRegistryResult> {
  // hass.callWS is untyped when hass is `any`, so type args would trigger TS2347.
  // Call sites keep their own typed hass; this helper is deliberately untyped
  // to avoid depending on the HomeAssistant type from this utility file.
  const [devices, entities]: [any[], any[]] = await Promise.all([
    hass.callWS({ type: 'config/device_registry/list' }),
    hass.callWS({ type: 'config/entity_registry/list' }),
  ]);

  const meshcoreDeviceMap: Record<string, string> = {};
  for (const device of devices) {
    if (!device.identifiers) continue;
    for (const [domain, key] of device.identifiers) {
      if (domain === 'meshcore') {
        meshcoreDeviceMap[key] = device.id;
      }
    }
  }

  const deviceEntities: Record<string, EntityInfo[]> = {};
  for (const entity of entities) {
    if (!entity.device_id || entity.disabled_by) continue;
    if (!entity.entity_id.startsWith('sensor.meshcore_')
        && !entity.entity_id.startsWith('binary_sensor.meshcore_')) continue;

    // Inject the live state's device_class as a fallback for classifyEntity.
    // The registry/list response on this HA install does not surface
    // original_device_class, but the running state's attributes do.
    const stateDc = hass.states?.[entity.entity_id]?.attributes?.device_class;
    const enriched = stateDc ? { ...entity, _stateDeviceClass: stateDc } : entity;

    const info = classifyEntity(enriched);
    if (!info) continue;
    if (!deviceEntities[entity.device_id]) deviceEntities[entity.device_id] = [];
    deviceEntities[entity.device_id].push(info);
  }

  for (const deviceId of Object.keys(deviceEntities)) {
    deviceEntities[deviceId].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { meshcoreDeviceMap, deviceEntities };
}
