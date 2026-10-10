import { describe, expect, it } from 'vitest';
import { estimateFrequency, findTrigger } from '../scope';

const FS = 48000;
const sine = (f: number, n: number, phase = 0) =>
  Float64Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * f * (i / FS) + phase));

describe('scope trigger', () => {
  it('finds the latest rising zero crossing of a sine', () => {
    const x = sine(1000, 4800);
    const t = findTrigger(x, 0, 'rising', 0, x.length);
    // rising zero crossings at multiples of 48 samples
    expect(t % 48).toBeLessThan(0.01);
    expect(t).toBeGreaterThan(4800 - 48 - 1);
  });

  it('respects slope and level', () => {
    const x = sine(1000, 960);
    const r = findTrigger(x, 0.25, 'rising', 0, 960);
    const f = findTrigger(x, 0.25, 'falling', 0, 960);
    expect(x[Math.round(r) + 1]).toBeGreaterThan(0.25);
    expect(x[Math.round(f) + 1]).toBeLessThan(0.25);
  });

  it('returns -1 when the level is never crossed', () => {
    expect(findTrigger(sine(1000, 960), 0.9, 'rising', 0, 960)).toBe(-1);
  });

  it('does not retrigger on noise inside the hysteresis band', () => {
    const x = Float64Array.from({ length: 2000 }, (_, i) => (i % 2 ? 0.0005 : -0.0005));
    expect(findTrigger(x, 0, 'rising', 0, x.length, 0.002)).toBe(-1);
  });
});

describe('frequency estimate', () => {
  for (const f of [50, 440, 1000, 7777]) {
    it(`${f} Hz within 0.1%`, () => {
      expect(Math.abs(estimateFrequency(sine(f, 9600, 0.3), FS) / f - 1)).toBeLessThan(0.001);
    });
  }
});
