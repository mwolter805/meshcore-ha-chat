// Threshold table and band evaluation for the node-summary aggregated card.
//
// Single source of truth for the colour bands used by hero tiles and the
// categorised sensor table. Each MetricKey has a band classifier, a tooltip
// prose snippet (the band statement), and an optional source citation.
//
// Band statements without a published source are presented without a citation
// line rather than fabricating one or labelling them "TBD" — this is the
// project's locked convention (see Proposed - Sensor Aggregation Card.md
// §"Threshold table" and §"Open questions — resolved").
//
// Battery voltage is intentionally NOT a MetricKey: chemistry varies by board
// (LiPo / LiFePO4 / 18650) and the integration does not expose chemistry per
// node, so voltage rows render as informational with no band colour. Only
// battery_percentage drives the battery bar's colour. (Q3 resolution.)

export type MetricKey =
  | 'battery_pct'
  | 'rssi'
  | 'snr'
  | 'noise_floor'
  | 'tx_airtime_util'
  | 'rx_airtime_util'
  | 'channel_util'
  | 'hop_count'
  | 'uptime_hours'
  | 'last_seen_hours'
  | 'request_success_rate'
  | 'duplicate_ratio'
  | 'tx_queue_len'
  | 'temperature';

export type Band = 'good' | 'warn' | 'bad' | 'info';

export interface SensorEval {
  /** Threshold band — drives the bar colour and the row status dot. */
  band: Band;
  /** Bar fill 0–100 mapped from value into the metric's natural display range. */
  fillPct: number;
  /** Band-statement prose for the info-tip popover. */
  tooltip: string;
  /** Citation URL. Omitted when no authoritative source backs the bands. */
  source?: string;
}

interface MetricSpec {
  /** Display range for the fill bar. The bar reads left=worst, right=best. */
  displayMin: number;
  displayMax: number;
  /** Whether higher raw values are better (battery, SNR, uptime) or worse
   *  (RSSI is special because more-negative is worse but we still display
   *  with worst-on-left, so "higher_better" applies — RSSI > -50 is better
   *  than RSSI < -120). For lower-better metrics like noise_floor, the bar
   *  is filled from the right toward the left as the value worsens. */
  direction: 'higher_better' | 'lower_better';
  classify: (value: number) => Band;
  tooltip: string;
  source?: string;
}

const METRICS: Record<MetricKey, MetricSpec> = {
  battery_pct: {
    displayMin: 0,
    displayMax: 100,
    direction: 'higher_better',
    classify: (v) => (v < 20 ? 'bad' : v < 50 ? 'warn' : 'good'),
    tooltip:
      'Green ≥ 50%, Yellow 20–50%, Red < 20% (critical < 10%). ' +
      'Home Assistant low-battery convention.',
    source:
      'https://community.home-assistant.io/t/low-battery-level-detection-notification-for-all-battery-sensors/258664',
  },

  rssi: {
    // dBm — typical LoRa range
    displayMin: -130,
    displayMax: -30,
    direction: 'higher_better',
    classify: (v) => (v < -115 ? 'bad' : v < -100 ? 'warn' : 'good'),
    tooltip:
      'Green > −100 dBm, Yellow −100 to −115 dBm, Red < −115 dBm. ' +
      'Lower (more negative) RSSI means a weaker received signal.',
    source: 'https://www.thethingsnetwork.org/docs/lorawan/rssi-and-snr/',
  },

  snr: {
    // dB — LoRa SNR
    displayMin: -20,
    displayMax: 20,
    direction: 'higher_better',
    classify: (v) => (v < -7 ? 'bad' : v < 0 ? 'warn' : 'good'),
    tooltip:
      'Green > 0 dB, Yellow −7 to 0 dB, Red < −7 dB. ' +
      'Demodulation floor is spreading-factor dependent (Semtech AN1200.13).',
    source:
      'https://www.openhacks.com/uploadsproductos/loradesignguide_std.pdf',
  },

  noise_floor: {
    // dBm — lower is better (further below thermal floor)
    displayMin: -130,
    displayMax: -90,
    direction: 'lower_better',
    classify: (v) => (v > -105 ? 'bad' : v > -115 ? 'warn' : 'good'),
    tooltip:
      'Green < −115 dBm, Yellow −115 to −105 dBm, Red > −105 dBm. ' +
      'Above −105 dBm typically indicates man-made RF interference, ' +
      'not thermal noise.',
    source:
      'https://www.openhacks.com/uploadsproductos/loradesignguide_std.pdf',
  },

  tx_airtime_util: {
    // Percent — duty-cycle limited
    displayMin: 0,
    displayMax: 20,
    direction: 'lower_better',
    classify: (v) => (v > 10 ? 'bad' : v > 2 ? 'warn' : 'good'),
    tooltip:
      'Green < 2%, Yellow 2–10%, Red > 10%. ' +
      'EU868 sub-band 1% / general 10% duty-cycle ceiling ' +
      '(ETSI EN 300 220-2; eCFR 47 CFR 15.247).',
    source:
      'https://www.etsi.org/deliver/etsi_en/300200_300299/30022002/03.03.01_60/en_30022002v030301p.pdf',
  },

  rx_airtime_util: {
    displayMin: 0,
    displayMax: 100,
    direction: 'lower_better',
    classify: (v) => (v > 50 ? 'bad' : v > 25 ? 'warn' : 'good'),
    tooltip:
      'Green < 25%, Yellow 25–50%, Red > 50%. ' +
      'High RX utilisation usually means heavy mesh traffic or ' +
      'environmental interference saturating the receiver.',
    // Editorial — no published threshold for receive-side saturation.
  },

  channel_util: {
    displayMin: 0,
    displayMax: 100,
    direction: 'lower_better',
    classify: (v) => (v > 50 ? 'bad' : v > 25 ? 'warn' : 'good'),
    tooltip:
      'Green < 25%, Yellow 25–50%, Red > 50%. ' +
      'Channel utilisation aggregates all activity on the radio channel.',
    // Editorial.
  },

  hop_count: {
    displayMin: 0,
    displayMax: 32,
    direction: 'lower_better',
    classify: (v) => (v >= 16 ? 'bad' : v >= 7 ? 'warn' : 'good'),
    tooltip:
      'Green ≤ 6, Yellow 7–15, Red ≥ 16. ' +
      'MeshCore allows up to 64 hops; community-recommended meshes run ' +
      'well under 32. Each hop adds airtime cost and latency.',
    source: 'https://nodakmesh.org/blog/meshcore-path-hash-explained',
  },

  uptime_hours: {
    displayMin: 0,
    displayMax: 168, // 1 week
    direction: 'higher_better',
    classify: (v) => (v < 1 ? 'bad' : v < 24 ? 'warn' : 'good'),
    tooltip:
      'Green > 24 h, Yellow 1–24 h, Red < 1 h. ' +
      'Very recent reboot suggests a watchdog reset or brownout.',
    // Editorial.
  },

  last_seen_hours: {
    displayMin: 0,
    displayMax: 6,
    direction: 'lower_better',
    classify: (v) => (v > 4 ? 'bad' : v > 2 ? 'warn' : 'good'),
    tooltip:
      'Green < 2 h, Yellow 2–4 h, Red > 4 h. ' +
      'Should be tuned to the node’s advertising interval; nodes ' +
      'that advertise hourly should appear far more often than nodes ' +
      'that advertise every 6 hours.',
    // Editorial.
  },

  request_success_rate: {
    displayMin: 0,
    displayMax: 100,
    direction: 'higher_better',
    classify: (v) => (v < 70 ? 'bad' : v < 90 ? 'warn' : 'good'),
    tooltip:
      'Green > 90%, Yellow 70–90%, Red < 70%. ' +
      'Caller is responsible for the min-sample floor — bars should ' +
      'render with band="info" until at least 50 attempts have ' +
      'accumulated.',
    // Editorial — no published MeshCore threshold.
  },

  duplicate_ratio: {
    displayMin: 0,
    displayMax: 100,
    direction: 'lower_better',
    // Always-info classify. Dup ratio is fundamentally a function of
    // neighbour count -- a node with N flood-active neighbours
    // expectedly sees ~(N-1)/N duplicates because each neighbour
    // retransmits the flood once. With no neighbour-count divisor
    // available there's no honest threshold to band against, so the
    // value renders informationally only. Documented in the deploy-
    // review research summary (iter13). See:
    //   https://meshtastic.org/docs/overview/mesh-algo/
    //   https://github.com/meshcore-dev/MeshCore/blob/main/docs/faq.md
    classify: () => 'info',
    tooltip: '',
  },

  tx_queue_len: {
    displayMin: 0,
    displayMax: 30,
    direction: 'lower_better',
    classify: (v) => (v > 10 ? 'bad' : v > 5 ? 'warn' : 'good'),
    tooltip:
      'Number of messages queued for transmission. ' +
      'Healthy nodes drain the queue quickly. Sustained backlog (> 10) ' +
      'indicates channel saturation or a stuck transmitter.',
    // Threshold sourced from the proposal mockup; no published MeshCore band.
  },

  temperature: {
    // Display range and band defined in °F. Caller (node-summary
    // ._evaluateForRow) is responsible for converting Celsius readings
    // to Fahrenheit before invoking evaluateSensor so a single set of
    // thresholds applies regardless of the entity's reporting unit.
    //
    //  Red  : < 0°F  or > 125°F   (≈ < −18°C or > 52°C)
    //  Green: 0°F to 125°F
    //
    // Chosen to flag electronics-damage extremes (battery freeze /
    // thermal runaway risk) without trying to be more clever about
    // ambient temperature elsewhere.
    displayMin: -20,
    displayMax: 140,
    direction: 'higher_better',
    classify: (v) => (v < 0 || v > 125 ? 'bad' : 'good'),
    tooltip:
      'Red below 0°F (≈ −18°C) or above 125°F (≈ 52°C); ' +
      'green otherwise. Extreme ambient temperatures risk damage to ' +
      'the radio, battery, or enclosure.',
    // No source — chosen for electronics-stress, not ambient comfort.
  },
};

/** Map a raw value into a 0–100 fill percentage along the metric's natural
 *  display range. Both directions clamp to [0, 100]; the consumer (stat-bar)
 *  always renders left-to-right and the band colour communicates the
 *  good/bad direction. */
function computeFillPct(value: number, spec: MetricSpec): number {
  const span = spec.displayMax - spec.displayMin;
  if (span <= 0) return 0;
  const raw = (value - spec.displayMin) / span;
  // For lower-is-better metrics, invert so a "good" reading still fills
  // most of the bar.
  const oriented = spec.direction === 'higher_better' ? raw : 1 - raw;
  return Math.max(0, Math.min(100, oriented * 100));
}

/** Evaluate a sensor reading against its threshold table.
 *
 *  - Returns band="info" with fillPct=0 and empty tooltip when the value is
 *    not finite (NaN, Infinity, missing).
 *  - Returns band="info" when the metric key is unknown (defensive — keeps
 *    callers safe if MetricKey gains a member that this module hasn't been
 *    updated for yet).
 *  - The min-sample floor for request_success_rate is the caller's
 *    responsibility; this module does not see sample counts. */
export function evaluateSensor(
  metricKey: MetricKey,
  value: number,
): SensorEval {
  if (!Number.isFinite(value)) {
    return { band: 'info', fillPct: 0, tooltip: '' };
  }
  const spec = METRICS[metricKey];
  if (!spec) {
    return { band: 'info', fillPct: 0, tooltip: '' };
  }
  return {
    band: spec.classify(value),
    fillPct: computeFillPct(value, spec),
    tooltip: spec.tooltip,
    source: spec.source,
  };
}
