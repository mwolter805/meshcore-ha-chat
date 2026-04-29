import { describe, it, expect } from 'vitest';
import {
  evaluateSensor,
  type MetricKey,
} from '../src/utils/sensor-thresholds';

// Per the proposal, evaluateSensor is the single source of truth for the
// threshold bands shown in the node-summary card. These tests pin the band
// boundaries from the proposal §"Threshold table" and the open-question
// resolutions Q1 (last-seen widened to <2 / 2-4 / >4 h), Q2 (hop ≤6 / 7-15
// / ≥16), Q3 (battery voltage NOT a metric key), Q9 (dup <5 / 5-10 / >10).
//
// fillPct is checked at the band-boundary cases only — the exact mapping is
// implementation detail and the bar visually clamps anyway.

describe('evaluateSensor — defensive cases', () => {
  it('returns info band for non-finite values', () => {
    const r = evaluateSensor('battery_pct', NaN);
    expect(r.band).toBe('info');
    expect(r.fillPct).toBe(0);
    expect(r.tooltip).toBe('');
  });

  it('returns info band for unknown metric keys', () => {
    // Cast through unknown to bypass the literal-union check; the runtime
    // guard is the contract under test.
    const r = evaluateSensor(
      'not_a_real_key' as unknown as MetricKey,
      50,
    );
    expect(r.band).toBe('info');
    expect(r.tooltip).toBe('');
  });
});

describe('evaluateSensor — battery_pct (Q3 locked)', () => {
  it('80% → good', () => {
    expect(evaluateSensor('battery_pct', 80).band).toBe('good');
  });
  it('50% (boundary) → good', () => {
    expect(evaluateSensor('battery_pct', 50).band).toBe('good');
  });
  it('30% → warn', () => {
    expect(evaluateSensor('battery_pct', 30).band).toBe('warn');
  });
  it('20% (boundary) → warn', () => {
    expect(evaluateSensor('battery_pct', 20).band).toBe('warn');
  });
  it('15% → bad', () => {
    expect(evaluateSensor('battery_pct', 15).band).toBe('bad');
  });
  it('5% (critical) → bad', () => {
    expect(evaluateSensor('battery_pct', 5).band).toBe('bad');
  });
  it('cites HA convention as source', () => {
    expect(evaluateSensor('battery_pct', 80).source).toMatch(
      /home-assistant/i,
    );
  });
});

describe('evaluateSensor — RSSI (TTN bands)', () => {
  it('-50 dBm → good', () => {
    expect(evaluateSensor('rssi', -50).band).toBe('good');
  });
  it('-100 dBm (boundary) → good', () => {
    expect(evaluateSensor('rssi', -100).band).toBe('good');
  });
  it('-110 dBm → warn', () => {
    expect(evaluateSensor('rssi', -110).band).toBe('warn');
  });
  it('-120 dBm → bad', () => {
    expect(evaluateSensor('rssi', -120).band).toBe('bad');
  });
});

describe('evaluateSensor — SNR (Semtech bands)', () => {
  it('5 dB → good', () => {
    expect(evaluateSensor('snr', 5).band).toBe('good');
  });
  it('-3 dB → warn', () => {
    expect(evaluateSensor('snr', -3).band).toBe('warn');
  });
  it('-10 dB → bad', () => {
    expect(evaluateSensor('snr', -10).band).toBe('bad');
  });
});

describe('evaluateSensor — noise_floor (lower is better)', () => {
  it('-120 dBm → good', () => {
    expect(evaluateSensor('noise_floor', -120).band).toBe('good');
  });
  it('-110 dBm → warn', () => {
    expect(evaluateSensor('noise_floor', -110).band).toBe('warn');
  });
  it('-100 dBm → bad (man-made interference)', () => {
    expect(evaluateSensor('noise_floor', -100).band).toBe('bad');
  });
  it('fillPct is high when noise floor is low (good direction)', () => {
    const r = evaluateSensor('noise_floor', -125);
    // displayMin -130, displayMax -90; lower_better → good values fill more.
    expect(r.fillPct).toBeGreaterThan(50);
  });
});

describe('evaluateSensor — TX airtime util (ETSI/FCC duty cycle)', () => {
  it('1% → good', () => {
    expect(evaluateSensor('tx_airtime_util', 1).band).toBe('good');
  });
  it('5% → warn', () => {
    expect(evaluateSensor('tx_airtime_util', 5).band).toBe('warn');
  });
  it('15% → bad (over duty cycle)', () => {
    expect(evaluateSensor('tx_airtime_util', 15).band).toBe('bad');
  });
});

describe('evaluateSensor — RX airtime util (editorial)', () => {
  it('10% → good', () => {
    expect(evaluateSensor('rx_airtime_util', 10).band).toBe('good');
  });
  it('35% → warn', () => {
    expect(evaluateSensor('rx_airtime_util', 35).band).toBe('warn');
  });
  it('60% → bad', () => {
    expect(evaluateSensor('rx_airtime_util', 60).band).toBe('bad');
  });
  it('emits no source line (editorial threshold)', () => {
    expect(evaluateSensor('rx_airtime_util', 10).source).toBeUndefined();
  });
});

describe('evaluateSensor — hop_count (Q2: ≤6 / 7-15 / ≥16)', () => {
  it('3 hops → good', () => {
    expect(evaluateSensor('hop_count', 3).band).toBe('good');
  });
  it('6 hops (boundary) → good', () => {
    expect(evaluateSensor('hop_count', 6).band).toBe('good');
  });
  it('10 hops → warn', () => {
    expect(evaluateSensor('hop_count', 10).band).toBe('warn');
  });
  it('15 hops (boundary) → warn', () => {
    expect(evaluateSensor('hop_count', 15).band).toBe('warn');
  });
  it('20 hops → bad', () => {
    expect(evaluateSensor('hop_count', 20).band).toBe('bad');
  });
});

describe('evaluateSensor — uptime_hours (editorial)', () => {
  it('100 h → good', () => {
    expect(evaluateSensor('uptime_hours', 100).band).toBe('good');
  });
  it('5 h → warn', () => {
    expect(evaluateSensor('uptime_hours', 5).band).toBe('warn');
  });
  it('0.5 h → bad (recent reboot)', () => {
    expect(evaluateSensor('uptime_hours', 0.5).band).toBe('bad');
  });
});

describe('evaluateSensor — last_seen_hours (Q1 widened: <2 / 2-4 / >4)', () => {
  it('1 h → good', () => {
    expect(evaluateSensor('last_seen_hours', 1).band).toBe('good');
  });
  it('3 h → warn', () => {
    expect(evaluateSensor('last_seen_hours', 3).band).toBe('warn');
  });
  it('5 h → bad', () => {
    expect(evaluateSensor('last_seen_hours', 5).band).toBe('bad');
  });
});

describe('evaluateSensor — request_success_rate (editorial)', () => {
  it('95% → good', () => {
    expect(evaluateSensor('request_success_rate', 95).band).toBe('good');
  });
  it('80% → warn', () => {
    expect(evaluateSensor('request_success_rate', 80).band).toBe('warn');
  });
  it('60% → bad', () => {
    expect(evaluateSensor('request_success_rate', 60).band).toBe('bad');
  });
  it('tooltip names the caller min-sample responsibility', () => {
    expect(evaluateSensor('request_success_rate', 95).tooltip).toMatch(
      /min-sample/i,
    );
  });
});

describe('evaluateSensor — duplicate_ratio (always-info per iter14)', () => {
  // Dup ratio scales with neighbour count: a flood-mesh repeater with
  // N flood-active neighbours expectedly sees ~(N-1)/N duplicates.
  // Without a neighbour-count divisor there's no honest threshold; the
  // value renders informationally only.
  it('10% → info', () => {
    expect(evaluateSensor('duplicate_ratio', 10).band).toBe('info');
  });
  it('50% (typical 2-neighbour repeater) → info', () => {
    expect(evaluateSensor('duplicate_ratio', 50).band).toBe('info');
  });
  it('80% (4-neighbour repeater) → info', () => {
    expect(evaluateSensor('duplicate_ratio', 80).band).toBe('info');
  });
});

describe('evaluateSensor — fillPct mapping', () => {
  it('battery 100% fills the bar', () => {
    expect(evaluateSensor('battery_pct', 100).fillPct).toBeCloseTo(100, 5);
  });
  it('battery 0% leaves the bar empty', () => {
    expect(evaluateSensor('battery_pct', 0).fillPct).toBeCloseTo(0, 5);
  });
  it('clamps below displayMin', () => {
    // RSSI displayMin is -130; a value at -200 should clamp to fillPct 0.
    expect(evaluateSensor('rssi', -200).fillPct).toBe(0);
  });
  it('clamps above displayMax', () => {
    // hop_count displayMax is 32; lower_better → high values clamp to 0.
    expect(evaluateSensor('hop_count', 100).fillPct).toBe(0);
  });
});
