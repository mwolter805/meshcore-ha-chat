/**
 * Distances follow Home Assistant's unit system: miles when its length
 * unit is "mi", kilometres otherwise.
 */
const KM_PER_MILE = 1.609344;

let hassLength: string | undefined;

/** Home Assistant's length unit ("km" or "mi"), from hass.config.unit_system. */
export function setHassLengthUnit(unit: string | undefined): void {
  hassLength = unit;
}

export function distanceUnit(): 'km' | 'mi' {
  return hassLength === 'mi' ? 'mi' : 'km';
}

/** A distance given in kilometres, in the chosen unit: "241 km", "150 mi"; one decimal below 10. */
export function formatLength(km: number, approx = false): string {
  const unit = distanceUnit();
  const value = unit === 'mi' ? km / KM_PER_MILE : km;
  return `${approx ? '~' : ''}${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
}
