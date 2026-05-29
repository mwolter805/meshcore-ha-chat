/**
 * Firmware vocabulary — enum-index and bitmask-bit definitions used to decode
 * MeshCore companion-firmware command responses and to encode command inputs.
 *
 * Every value carries a citation to the upstream MeshCore firmware source
 * (github.com/meshcore-dev/MeshCore) so the mapping stays auditable as the
 * firmware evolves. Citations verified against the firmware tree at the time
 * of writing. Both the response value-formatters and the command param
 * definitions read from this single source of truth.
 *
 * Scaling note: latitude/longitude and radio frequency/bandwidth are NOT
 * scaled here. The Python SDK already divides lat/lon by 1e6 and freq/bw by
 * 1000 before the values reach the panel, so they arrive as decimal degrees
 * and MHz/kHz respectively — a second scaling step here would be a bug.
 */

/**
 * Coerce a raw value to a finite number, or undefined. Response payloads come
 * from device firmware over the WebSocket; a malformed or partial frame must
 * surface a visible fallback rather than a silently-wrong decode (e.g. `NaN`
 * or all-flags-false).
 */
export const num = (v: unknown): number | undefined => {
  // Treat null/undefined (a missing field) as non-numeric. Number(null) is 0,
  // which would otherwise silently decode a missing value to the index-0 label.
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Enum index → display label. Indexing is guarded: a non-finite or
 * out-of-range index renders `Unknown (<raw>)`, preserving the raw value so a
 * firmware update that adds a new index is visible rather than blank.
 */
export const ENUMS = {
  // Advert location policy. Defines: src/helpers/CommonCLI.h:13-15
  // (ADVERT_LOC_NONE=0, ADVERT_LOC_SHARE=1, ADVERT_LOC_PREFS=2).
  // Semantics: src/helpers/CommonCLI.cpp:198-206 — SHARE advertises the live
  // sensor GPS fix, PREFS advertises the saved preference coordinates.
  LOC_POLICY: ['None', 'Share (Live GPS)', 'Saved Prefs'] as string[],

  // Path-hash width selector. A wire value of N selects an (N+1)-byte path
  // hash: examples/companion_radio/MyMesh.cpp:487 (sendFlood(..., path_hash_mode + 1));
  // field at examples/companion_radio/NodePrefs.h:33.
  PATH_HASH_MODE: ['1-Byte', '2-Byte', '3-Byte'] as string[],

  // Telemetry permission mode. Defines: examples/companion_radio/NodePrefs.h:4-6
  // (TELEM_MODE_DENY=0, TELEM_MODE_ALLOW_FLAGS=1, TELEM_MODE_ALLOW_ALL=2).
  // Three values, not four. Packed 2-bits-per-field in the SELF_INFO frame
  // (MyMesh.cpp:1040-1041) and unpacked by the SDK
  // (meshcore_py src/meshcore/reader.py:170-172).
  TELEMETRY_MODE: ['Deny', 'Allow (Per Contact Flags)', 'Allow All'] as string[],
};

/**
 * Auto-add config bitmask. Bit value → label.
 * Defines: examples/companion_radio/MyMesh.cpp:141-145
 * (AUTO_ADD_OVERWRITE_OLDEST=0x01, AUTO_ADD_CHAT=0x02, AUTO_ADD_REPEATER=0x04,
 *  AUTO_ADD_ROOM_SERVER=0x08, AUTO_ADD_SENSOR=0x10).
 */
export const AUTOADD_BITS: Array<{ label: string; value: number }> = [
  { label: 'Overwrite Oldest When Full', value: 0x01 }, // AUTO_ADD_OVERWRITE_OLDEST  MyMesh.cpp:141
  { label: 'Auto-Add Chat (Companion)', value: 0x02 }, //  AUTO_ADD_CHAT              MyMesh.cpp:142
  { label: 'Auto-Add Repeater', value: 0x04 }, //          AUTO_ADD_REPEATER          MyMesh.cpp:143
  { label: 'Auto-Add Room Server', value: 0x08 }, //       AUTO_ADD_ROOM_SERVER       MyMesh.cpp:144
  { label: 'Auto-Add Sensor', value: 0x10 }, //            AUTO_ADD_SENSOR            MyMesh.cpp:145
];

/** A bitmask decoded to a map of flag-label → set/unset. */
export interface DecodedBitmask {
  [flagLabel: string]: boolean;
}

/**
 * Decode an enum index to its label, with a visible fallback for non-finite
 * or out-of-range indices.
 */
export function decodeEnum(raw: unknown, labels: string[]): string {
  const i = num(raw);
  if (i !== undefined && labels[i] !== undefined) {
    return labels[i];
  }
  return `Unknown (${raw})`;
}

/**
 * Decode a raw bitmask integer to a map of flag-label → boolean.
 * Caller is responsible for passing a finite number (formatters guard with
 * `num()` first); a non-finite raw would otherwise decode to all-flags-false.
 */
export function decodeBitmask(
  raw: number,
  bits: Array<{ label: string; value: number }>,
): DecodedBitmask {
  const out: DecodedBitmask = {};
  for (const b of bits) {
    out[b.label] = (raw & b.value) === b.value;
  }
  return out;
}
