import { describe, it, expect } from 'vitest';
import {
  ENUMS,
  AUTOADD_BITS,
  decodeEnum,
  decodeBitmask,
  num,
} from '../src/firmware-vocabulary';

describe('num', () => {
  it('returns finite numbers unchanged', () => {
    expect(num(0)).toBe(0);
    expect(num(13)).toBe(13);
    expect(num('2')).toBe(2);
  });

  it('returns undefined for non-finite or malformed input', () => {
    expect(num(undefined)).toBeUndefined();
    expect(num(null)).toBeUndefined();
    expect(num('xx')).toBeUndefined();
    expect(num(NaN)).toBeUndefined();
    expect(num(Infinity)).toBeUndefined();
  });
});

describe('decodeBitmask', () => {
  it('round-trips an OR of selected bits back to the same flags', () => {
    // Overwrite Oldest (0x01) | Repeater (0x04) | Room Server (0x08) == 13.
    const encoded =
      AUTOADD_BITS[0].value | AUTOADD_BITS[2].value | AUTOADD_BITS[3].value;
    expect(encoded).toBe(13);

    const decoded = decodeBitmask(encoded, AUTOADD_BITS);
    expect(decoded).toEqual({
      'Overwrite Oldest When Full': true,
      'Auto-Add Chat (Companion)': false,
      'Auto-Add Repeater': true,
      'Auto-Add Room Server': true,
      'Auto-Add Sensor': false,
    });
  });

  it('decodes zero to all flags unset', () => {
    const decoded = decodeBitmask(0, AUTOADD_BITS);
    expect(Object.values(decoded).every((v) => v === false)).toBe(true);
  });
});

describe('decodeEnum', () => {
  it('maps an in-range index to its label', () => {
    expect(decodeEnum(0, ENUMS.LOC_POLICY)).toBe('None');
    expect(decodeEnum(1, ENUMS.LOC_POLICY)).toBe('Share (Live GPS)');
    expect(decodeEnum(2, ENUMS.LOC_POLICY)).toBe('Saved Prefs');
    expect(decodeEnum(0, ENUMS.TELEMETRY_MODE)).toBe('Deny');
    expect(decodeEnum(2, ENUMS.TELEMETRY_MODE)).toBe('Allow All');
  });

  it('renders Unknown(N) for an out-of-range index, preserving N', () => {
    expect(decodeEnum(9, ENUMS.LOC_POLICY)).toBe('Unknown (9)');
    expect(decodeEnum(3, ENUMS.TELEMETRY_MODE)).toBe('Unknown (3)');
    expect(decodeEnum(-1, ENUMS.PATH_HASH_MODE)).toBe('Unknown (-1)');
  });

  it('renders a visible fallback for non-finite / malformed input', () => {
    expect(decodeEnum(undefined, ENUMS.LOC_POLICY)).toBe('Unknown (undefined)');
    expect(decodeEnum('xx', ENUMS.LOC_POLICY)).toBe('Unknown (xx)');
    expect(decodeEnum(NaN, ENUMS.LOC_POLICY)).toBe('Unknown (NaN)');
  });
});
