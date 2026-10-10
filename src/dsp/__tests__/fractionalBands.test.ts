import { describe, expect, it } from 'vitest';
import { fractionalCenters, groupFractional } from '../fractionalBands';

describe('fractional-octave grouping', () => {
  it('1/48-octave centres are base-2 around 1 kHz', () => {
    const c = fractionalCenters(48, 20, 20000);
    expect(c.some((f) => Math.abs(f - 1000) < 1e-9)).toBe(true);
    expect(c[1] / c[0]).toBeCloseTo(2 ** (1 / 48), 12);
    expect(c[0]).toBeGreaterThanOrEqual(20);
    expect(c.at(-1)!).toBeLessThanOrEqual(20000);
    expect(c.length).toBeGreaterThan(470);
  });

  it('a flat spectrum stays flat, including bands narrower than a bin', () => {
    const power = new Float64Array(8193).fill(2);
    const binHz = 48000 / 16384;
    const c = fractionalCenters(48, 20, 20000);
    const g = groupFractional(power, binHz, c, 48);
    for (const v of g) expect(v).toBeCloseTo(2, 10);
  });

  it('a single tone lands in the band containing it', () => {
    const binHz = 48000 / 16384;
    const power = new Float64Array(8193);
    const k = Math.round(3000 / binHz);
    power[k] = 1;
    const c = fractionalCenters(12, 20, 20000);
    const g = groupFractional(power, binHz, c, 12);
    const best = g.indexOf(Math.max(...g));
    expect(Math.abs(Math.log2(c[best] / (k * binHz)))).toBeLessThan(1 / 24 + 1e-9);
  });
});
