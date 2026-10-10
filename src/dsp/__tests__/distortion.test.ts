import { describe, expect, it } from 'vitest';
import { analyzeDistortion } from '../distortion';

const FS = 48000;
const N = 32768;

function signal(f: number, amp: number, harmonics: [number, number][], noiseRms = 0) {
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  return Float64Array.from({ length: N }, (_, i) => {
    let v = amp * Math.sin((2 * Math.PI * f * i) / FS);
    for (const [h, rel] of harmonics) v += amp * rel * Math.sin((2 * Math.PI * h * f * i) / FS + 0.3 * h);
    return v + noiseRms * Math.sqrt(12) * rand();
  });
}

describe('distortion analysis', () => {
  it('pure sine: finds f0 and level, THD essentially zero', () => {
    const r = analyzeDistortion(signal(1000.3, 0.5, []), FS);
    expect(r.f0).toBeCloseTo(1000.3, 1);
    expect(r.levelDbfs).toBeCloseTo(20 * Math.log10(0.5), 1);
    expect(r.thd).toBeLessThan(1e-5);
  });

  it('measures known harmonics: H2 1 %, H3 0.316 % → THD 1.049 %', () => {
    const r = analyzeDistortion(signal(997, 0.3, [[2, 0.01], [3, 0.00316]]), FS);
    expect(r.harmonics[0].n).toBe(2);
    expect(r.harmonics[0].percent).toBeCloseTo(1, 2);
    expect(r.harmonics[1].db).toBeCloseTo(-50, 0);
    expect(r.thd * 100).toBeCloseTo(1.0488, 2);
    expect(r.thdn).toBeGreaterThanOrEqual(r.thd);
  });

  it('THD+N includes noise', () => {
    // 0.5 sine (RMS 0.354) with white noise RMS 0.00354 → N ≈ 1 % of fundamental (band-limited to 20 Hz–20 kHz)
    const r = analyzeDistortion(signal(1000, 0.5, [], 0.00354), FS);
    expect(r.thd).toBeLessThan(0.002);
    expect(r.thdn * 100).toBeGreaterThan(0.8);
    expect(r.thdn * 100).toBeLessThan(1.05);
  });

  it('uses the frequency hint to ignore a louder off-target tone', () => {
    const x = signal(100, 0.1, []);
    const y = signal(3000, 0.4, []);
    const r = analyzeDistortion(x.map((v, i) => v + y[i]), FS, 100);
    expect(r.f0).toBeCloseTo(100, 0);
  });
});
