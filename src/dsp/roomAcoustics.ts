import { BiquadCascade } from './biquad';
import { designBandpass } from './bands';
import { fftOf, ifft } from './deconvolve';
import { nextPow2 } from './sweep';

export const RT_BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];

export interface RoomMetrics {
  edt: number; // s
  t20: number; // s
  t30: number; // s
  c50: number; // dB
  c80: number; // dB
  d50: number; // ratio 0…1
  ts: number; // s (centre time)
  /** Peak-to-noise ratio of the energy curve, dB. */
  snr: number;
}

export interface DecayAnalysis extends RoomMetrics {
  /** Index of the direct sound (start of the decay). */
  start: number;
  /** Index where the decay meets the noise floor (integration stops here). */
  end: number;
  /** Schroeder curve in dB from `start`, normalised to 0 dB, sampled every `step` samples. */
  schroeder: Float32Array;
  step: number;
  noiseDb: number;
}

/**
 * Energy-time curve (squared Hilbert envelope) in dB re its maximum, optionally smoothed with a
 * centred moving average of `smooth` samples.
 */
export function etc(ir: ArrayLike<number>, smooth = 1): Float32Array {
  const n = nextPow2(ir.length);
  const fft = fftOf(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < ir.length; i++) re[i] = ir[i];
  fft.transform(re, im);
  // analytic signal: keep DC and Nyquist, double positive, zero negative frequencies
  for (let k = 1; k < n / 2; k++) {
    re[k] *= 2;
    im[k] *= 2;
  }
  for (let k = n / 2 + 1; k < n; k++) {
    re[k] = 0;
    im[k] = 0;
  }
  ifft(fft, re, im);
  const m = ir.length;
  const e = new Float64Array(m);
  for (let i = 0; i < m; i++) e[i] = re[i] * re[i] + im[i] * im[i];
  let env = e;
  if (smooth > 1) {
    env = new Float64Array(m);
    const half = Math.floor(smooth / 2);
    let acc = 0;
    for (let i = 0; i < Math.min(m, half); i++) acc += e[i];
    for (let i = 0; i < m; i++) {
      if (i + half < m) acc += e[i + half];
      if (i - half - 1 >= 0) acc -= e[i - half - 1];
      env[i] = acc / (Math.min(m - 1, i + half) - Math.max(0, i - half) + 1);
    }
  }
  const out = new Float32Array(m);
  let max = 1e-30;
  for (let i = 0; i < m; i++) max = Math.max(max, env[i]);
  for (let i = 0; i < m; i++) out[i] = 10 * Math.log10(env[i] / max + 1e-30);
  return out;
}

/** Least-squares slope (per sample) and intercept of y over x indices [a, b). */
function regress(y: ArrayLike<number>, a: number, b: number): { m: number; c: number } {
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const n = b - a;
  for (let i = a; i < b; i++) {
    sx += i;
    sy += y[i];
    sxx += i * i;
    sxy += i * y[i];
  }
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  return { m, c: (sy - m * sx) / n };
}

/**
 * ISO 3382-style decay analysis of an impulse response: direct-sound onset, noise-floor
 * truncation with late-energy compensation (simplified Lundeby), Schroeder integration and
 * the standard metrics.
 */
export function analyzeDecay(ir: ArrayLike<number>, fs: number): DecayAnalysis {
  const n = ir.length;
  const p = new Float64Array(n);
  let peak = 0;
  let peakI = 0;
  for (let i = 0; i < n; i++) {
    p[i] = ir[i] * ir[i];
    if (p[i] > peak) {
      peak = p[i];
      peakI = i;
    }
  }
  // start: first sample within 20 dB of the peak (ISO 3382-1 A.3.4)
  let start = peakI;
  for (let i = Math.max(0, peakI - Math.round(0.01 * fs)); i <= peakI; i++) {
    if (p[i] >= peak / 100) {
      start = i;
      break;
    }
  }

  // noise floor from the last 10 % of the response
  const tailFrom = Math.floor(n * 0.9);
  let noise = 0;
  for (let i = tailFrom; i < n; i++) noise += p[i];
  noise /= Math.max(1, n - tailFrom);
  const noiseDb = 10 * Math.log10(noise / peak + 1e-30);

  // smoothed level in 10 ms blocks (dB re peak) from the start
  const blk = Math.max(1, Math.round(0.01 * fs));
  const nb = Math.floor((n - start) / blk);
  const lvl = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    let e = 0;
    for (let i = 0; i < blk; i++) e += p[start + b * blk + i];
    lvl[b] = 10 * Math.log10(e / blk / peak + 1e-30);
  }

  // where the decay meets the noise: regress from −5 dB down to noise + 10 dB, intersect
  let end = n;
  let tail = 0;
  if (noise > 0 && nb > 4) {
    const top = lvl.findIndex((v, i) => i > 0 && v < lvl[0] - 5);
    let bot = top;
    while (bot < nb && lvl[bot] > noiseDb + 10) bot++;
    if (top > 0 && bot - top >= 2) {
      const { m, c } = regress(lvl, top, bot);
      if (m < 0) {
        const cross = (noiseDb - c) / m; // in blocks
        end = Math.min(n, start + Math.max(1, Math.round(cross * blk)));
        // energy beyond `end` if the decay had continued: e(end)/(1 − r) with r per-sample decay
        const eEnd = peak * 10 ** ((m * cross + c) / 10);
        const r = 10 ** (m / blk / 10);
        tail = Math.max(0, eEnd * (r / (1 - r)));
      }
    }
  }

  // Schroeder backward integral from `end` (plus compensation), sampled every `step`
  const step = Math.max(1, Math.round(fs / 2000));
  const len = end - start;
  const cum = new Float64Array(len + 1);
  cum[len] = tail;
  for (let i = len - 1; i >= 0; i--) cum[i] = cum[i + 1] + p[start + i];
  const total = cum[0] || 1e-30;
  const schroeder = new Float32Array(Math.ceil(len / step));
  for (let j = 0; j < schroeder.length; j++) schroeder[j] = 10 * Math.log10(cum[j * step] / total + 1e-30);

  const rt = (from: number, to: number) => {
    const a = schroeder.findIndex((v) => v <= from);
    const b = schroeder.findIndex((v) => v <= to);
    if (a < 0 || b < 0 || b - a < 2) return NaN;
    const { m } = regress(schroeder, a, b);
    return m < 0 ? -60 / (m * (fs / step)) : NaN;
  };
  const at = (s: number) => Math.min(len, Math.round(s * fs));
  /** Energy from the start up to sample i. */
  const e = (i: number) => total - cum[Math.min(len, i)];
  const early50 = e(at(0.05));
  const early80 = e(at(0.08));
  let tsNum = 0;
  for (let i = 0; i < len; i++) tsNum += (i / fs) * p[start + i];

  return {
    start,
    end,
    schroeder,
    step,
    noiseDb,
    edt: rt(-0.01, -10),
    t20: rt(-5, -25),
    t30: rt(-5, -35),
    c50: 10 * Math.log10(early50 / Math.max(1e-30, total - early50)),
    c80: 10 * Math.log10(early80 / Math.max(1e-30, total - early80)),
    d50: early50 / total,
    ts: tsNum / total,
    snr: -noiseDb,
  };
}

/** Octave-band impulse responses (125 Hz – 8 kHz). */
export function octaveBandIrs(ir: ArrayLike<number>, fs: number): { center: number; ir: Float64Array }[] {
  return RT_BANDS.filter((f) => f * Math.SQRT2 < fs / 2).map((center) => {
    const d = designBandpass(center / Math.SQRT2, center * Math.SQRT2, fs);
    const filt = new BiquadCascade(d.sections, d.gain);
    const out = new Float64Array(ir.length);
    for (let i = 0; i < ir.length; i++) out[i] = filt.processSample(ir[i]);
    return { center, ir: out };
  });
}
