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

export interface EntityInfo {
  entity_id: string;
  label: string;
  icon: string;
  colorScheme: 'battery' | 'signal' | 'neutral';
  sortOrder: number;
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
  const dc: string | null = entity.original_device_class ?? null;

  // --- Step 1: exclude peer-contact binary_sensors ---
  // All meshcore binary_sensors today are contact-discovery entities with
  // device_class="connectivity". The defensive second check catches any
  // future binary_sensor that ships without a device_class; if/when a real
  // tile-worthy binary_sensor is added to the integration, add an explicit
  // allow-case above this line.
  if (eid.startsWith('binary_sensor.meshcore_') && dc === 'connectivity') return null;
  if (eid.startsWith('binary_sensor.meshcore_')) return null;

  // --- Step 2: meshcore-specific status/control exclusions (entity_id substrings) ---
  if (eid.includes('node_status') || eid.includes('companion_prefix')
      || eid.includes('request_rate') || eid.includes('delivery')
      || eid.includes('path_') || eid.includes('neighbor_')) return null;

  // --- Step 3: classify by HA device_class ---
  if (dc === 'battery') {
    return { entity_id: eid, label: 'Battery', icon: 'battery',
             colorScheme: 'battery', sortOrder: 1 };
  }
  if (dc === 'voltage') {
    return { entity_id: eid, label: 'Voltage', icon: 'power',
             colorScheme: 'neutral', sortOrder: 2 };
  }
  if (dc === 'duration') {
    return { entity_id: eid, label: 'Uptime', icon: 'clock',
             colorScheme: 'neutral', sortOrder: 3 };
  }
  if (dc === 'signal_strength') {
    // Currently only TX Power uses signal_strength in meshcore.
    return { entity_id: eid, label: 'TX Power', icon: 'power',
             colorScheme: 'neutral', sortOrder: 6 };
  }
  if (dc === 'temperature') {
    return { entity_id: eid, label: 'Temperature', icon: 'thermometer',
             colorScheme: 'neutral', sortOrder: 7 };
  }
  if (dc === 'power_factor') {
    // Airtime Utilization / RX Airtime Utilization (both use power_factor).
    const label = eid.includes('rx_') ? 'RX Airtime Util' : 'Airtime Util';
    return { entity_id: eid, label, icon: 'chart',
             colorScheme: 'neutral', sortOrder: 10 };
  }

  // --- Step 4: entity_id substring fallback (categories without a device_class) ---
  if (eid.includes('snr') && !eid.includes('neighbor')) {
    return { entity_id: eid, label: 'SNR', icon: 'signal',
             colorScheme: 'signal', sortOrder: 4 };
  }
  if (eid.includes('rssi')) {
    return { entity_id: eid, label: 'RSSI', icon: 'signal',
             colorScheme: 'signal', sortOrder: 5 };
  }
  if (eid.includes('contact_count')) {
    return { entity_id: eid, label: 'Contacts', icon: 'counter',
             colorScheme: 'neutral', sortOrder: 8 };
  }
  if (eid.includes('airtime') || eid.includes('air_util')) {
    // Raw airtime without power_factor device_class. Utilization variants
    // were already caught in Step 3.
    return { entity_id: eid, label: 'Airtime', icon: 'chart',
             colorScheme: 'neutral', sortOrder: 9 };
  }
  if (eid.includes('channel_util')) {
    return { entity_id: eid, label: 'Channel Util', icon: 'chart',
             colorScheme: 'neutral', sortOrder: 10 };
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

    const info = classifyEntity(entity);
    if (!info) continue;
    if (!deviceEntities[entity.device_id]) deviceEntities[entity.device_id] = [];
    deviceEntities[entity.device_id].push(info);
  }

  for (const deviceId of Object.keys(deviceEntities)) {
    deviceEntities[deviceId].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { meshcoreDeviceMap, deviceEntities };
}
