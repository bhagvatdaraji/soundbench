import { describe, expect, it } from 'vitest';
import { SpectrumAnalyzer } from '../fft';
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

  it('sum mode reads a tone at its true level in a band several bins wide', () => {
    const fs = 48000;
    const n = 16384;
    const sa = new SpectrumAnalyzer(n, 'hann');
    expect(sa.enbw).toBeCloseTo(1.5, 3);
    const x = Float64Array.from({ length: n }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 2000.7 * i) / fs));
    const p = new Float64Array(n / 2 + 1);
    sa.power(x, p);
    const c = fractionalCenters(48, 20, 20000);
    const g = groupFractional(p, fs / n, c, 48, undefined, 'sum', sa.enbw);
    const total = Math.max(...g);
    // RMS² of a 0.1 sine is 0.005; allow 0.5 dB (a tone near a band edge splits across two)
    expect(Math.abs(10 * Math.log10(total / 0.005))).toBeLessThan(0.5);
  });
});
