import { describe, expect, it } from 'vitest';
import { findDelay, TransferAnalyzer } from '../transfer';

const FS = 48000;
// Lehmer generators; different multipliers so two noises are genuinely uncorrelated
// (with one multiplier, seeds 1 and 2 give the same sequence scaled by 2).
function noise(n: number, seed = 5, mult = 16807) {
  let s = seed;
  return Float64Array.from({ length: n }, () => ((s = (s * mult) % 2147483647) / 2147483647 - 0.5));
}

describe('transfer function', () => {
  it('finds the delay between reference and measurement', () => {
    const x = noise(FS);
    const y = new Float64Array(FS);
    for (let i = 300; i < FS; i++) y[i] = 0.5 * x[i - 300];
    const d = findDelay(x, y, 4800);
    expect(d.lag).toBeCloseTo(300, 1);
    expect(d.quality).toBeGreaterThan(0.5);
  });

  it('flat gain, zero phase and coherence 1 for an aligned scaled copy', () => {
    const N = 8192;
    const ta = new TransferAnalyzer(N, FS);
    const x = noise(N * 8);
    for (let f = 0; f < 8; f++) {
      const seg = x.subarray(f * N, (f + 1) * N);
      ta.add(seg, seg.map((v) => 0.5 * v));
    }
    const r = ta.result(12);
    r.freqs.forEach((f, i) => {
      if (f > 50 && f < 15000) {
        expect(Math.abs(r.db[i] + 6.02), `${f} Hz`).toBeLessThan(0.05);
        expect(Math.abs(r.phase[i])).toBeLessThan(0.5);
        expect(r.coherence[i]).toBeGreaterThan(0.999);
      }
    });
  });

  it('uncorrelated noise in the measurement lowers coherence', () => {
    const N = 8192;
    const ta = new TransferAnalyzer(N, FS);
    const x = noise(N * 16, 1);
    const n = noise(N * 16, 2, 48271);
    for (let f = 0; f < 16; f++) {
      const a = x.subarray(f * N, (f + 1) * N);
      const b = n.subarray(f * N, (f + 1) * N);
      ta.add(a, a.map((v, i) => v + b[i])); // SNR 0 dB → γ² ≈ 0.5
    }
    const r = ta.result(6);
    const mid = r.coherence.filter((_, i) => r.freqs[i] > 200 && r.freqs[i] < 10000);
    const mean = mid.reduce((s, v) => s + v, 0) / mid.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });
});
