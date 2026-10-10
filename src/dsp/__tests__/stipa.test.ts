import { describe, expect, it } from 'vitest';
import { fftOf, ifft } from '../deconvolve';
import { nextPow2 } from '../sweep';
import { analyzeStipa, generateStipa, stiFromMtf, stiRating } from '../stipa';

const FS = 32000; // keeps the test quick; 8 kHz band still below Nyquist
const SECONDS = 16;

function convolve(x: Float32Array, h: Float64Array): Float64Array {
  const n = nextPow2(x.length + h.length);
  const fft = fftOf(n);
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x);
  br.set(h);
  fft.transform(ar, ai);
  fft.transform(br, bi);
  for (let k = 0; k < n; k++) {
    const r = ar[k] * br[k] - ai[k] * bi[k];
    ai[k] = ar[k] * bi[k] + ai[k] * br[k];
    ar[k] = r;
  }
  ifft(fft, ar, ai);
  return ar.slice(0, x.length);
}

describe('STIPA', () => {
  const clean = generateStipa(FS, SECONDS);

  it('a clean channel scores close to 1', () => {
    const r = analyzeStipa(clean, FS);
    expect(r.sti).toBeGreaterThan(0.95);
    expect(stiRating(r.sti).band).toBe('A+');
  });

  it('pure reverberation matches the analytic MTF (RT60 1.2 s)', () => {
    const T = 1.2;
    let s = 99;
    const g = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
    const h = Float64Array.from({ length: Math.round(T * 1.6 * FS) }, (_, i) => g() * Math.exp((-6.9078 * i) / FS / T));
    const r = analyzeStipa(convolve(clean, h), FS);
    const expected = stiFromMtf((_, F) => 1 / Math.sqrt(1 + ((2 * Math.PI * F * T) / 13.8) ** 2));
    expect(Math.abs(r.sti - expected)).toBeLessThan(0.04);
  });

  it('equal-power unmodulated noise (0 dB SNR per band) gives STI ≈ 0.5', () => {
    const noise = generateStipa(FS, SECONDS, 0);
    // independent noise: shift it so its carriers don't line up with the signal's
    const mixed = clean.map((v, i) => v + noise[(i + 12345) % noise.length]);
    const r = analyzeStipa(mixed, FS);
    expect(r.sti).toBeGreaterThan(0.44);
    expect(r.sti).toBeLessThan(0.56);
  });
});
