import type { HomeAssistant } from '../types';
import { getDeviceConfig } from '../api';

/** Our companion's position, read once per page load and config entry. */
const ownPositions = new Map<string, Promise<{ lat: number; lon: number } | null>>();

export function loadOwnPosition(hass: HomeAssistant, entryId?: string): Promise<{ lat: number; lon: number } | null> {
  const key = entryId ?? '';
  let pending = ownPositions.get(key);
  if (!pending) {
    pending = getDeviceConfig(hass, entryId)
      .then((c) => {
        const lat = Number(c.latitude);
        const lon = Number(c.longitude);
        return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? { lat, lon } : null;
      })
      .catch(() => null)
      .then((pos) => {
        if (pos) return pos;
        // Fall back to Home Assistant's home zone.
        const home = hass.states['zone.home']?.attributes as Record<string, unknown> | undefined;
        const lat = Number(home?.latitude);
        const lon = Number(home?.longitude);
        return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
      });
    ownPositions.set(key, pending);
  }
  return pending;
}
