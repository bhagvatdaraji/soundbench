import { FFT } from './fft';

/** 7-term Blackman-Harris: about −180 dB sidelobes, so low harmonics aren't masked by leakage. */
const BH7 = [0.27105140069342, 0.43329793923448, 0.21812299954311, 0.06592544638803, 0.01081174209837, 0.00077658482522, 0.00001388721735];
const LOBE = 7; // bins either side of a tone that belong to it

export interface Harmonic {
  n: number;
  freq: number;
  /** dB relative to the fundamental. */
  db: number;
  percent: number;
}

export interface DistortionResult {
  f0: number;
  /** Fundamental level, dBFS (AES17: full-scale sine = 0). */
  levelDbfs: number;
  harmonics: Harmonic[];
  thd: number; // ratio
  thdn: number; // ratio
  /** Power spectrum (tone-corrected so a sine's peak bin ≈ its mean square), for display. */
  power: Float64Array;
  binHz: number;
}

const windows = new Map<number, { w: Float64Array; sum: number; enbw: number }>();
function bh7(n: number) {
  let c = windows.get(n);
  if (!c) {
    const w = new Float64Array(n);
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const x = (2 * Math.PI * i) / n;
      let v = 0;
      for (let k = 0; k < BH7.length; k++) v += (k % 2 ? -1 : 1) * BH7[k] * Math.cos(k * x);
      w[i] = v;
      sum += v;
      sq += v * v;
    }
    c = { w, sum, enbw: (n * sq) / (sum * sum) };
    windows.set(n, c);
  }
  return c;
}
const ffts = new Map<number, FFT>();

/**
 * THD and THD+N of a (mostly) sinusoidal signal. `x.length` must be a power of two.
 * Harmonics up to H10 below min(20 kHz, Nyquist). THD+N covers 20 Hz – 20 kHz.
 * Both ratios are relative to the fundamental.
 */
export function analyzeDistortion(x: ArrayLike<number>, fs: number, hintHz?: number): DistortionResult {
  const n = x.length;
  const { w, sum, enbw } = bh7(n);
  let fft = ffts.get(n);
  if (!fft) ffts.set(n, (fft = new FFT(n)));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i] * w[i];
  fft.transform(re, im);
  const bins = n / 2 + 1;
  const power = new Float64Array(bins);
  const scale = 2 / (sum * sum);
  for (let k = 0; k < bins; k++) power[k] = (re[k] * re[k] + im[k] * im[k]) * scale;
  const binHz = fs / n;
  const top = Math.min(20000, fs / 2 - binHz * LOBE);

  // fundamental: strongest bin (near the hint if given)
  let lo = Math.max(2, Math.floor(20 / binHz));
  let hi = Math.floor(top / binHz);
  if (hintHz) {
    lo = Math.max(lo, Math.floor((hintHz * 0.9) / binHz));
    hi = Math.min(hi, Math.ceil((hintHz * 1.1) / binHz));
  }
  let k0 = lo;
  for (let k = lo; k <= hi; k++) if (power[k] > power[k0]) k0 = k;
  const a = Math.log(power[k0 - 1] + 1e-30);
  const b = Math.log(power[k0] + 1e-30);
  const c = Math.log(power[k0 + 1] + 1e-30);
  const d = a - 2 * b + c;
  const f0 = (k0 + (d ? (0.5 * (a - c)) / d : 0)) * binHz;

  /** Tone power around frequency f: sum of its main-lobe bins / ENBW. */
  const tone = (f: number) => {
    const kc = Math.round(f / binHz);
    let s = 0;
    for (let k = Math.max(1, kc - LOBE); k <= Math.min(bins - 1, kc + LOBE); k++) s += power[k];
    return s / enbw;
  };
  const p1 = tone(f0);
  const harmonics: Harmonic[] = [];
  let ph = 0;
  for (let h = 2; h <= 10 && h * f0 <= top; h++) {
    const p = tone(h * f0);
    ph += p;
    const r = Math.sqrt(p / p1);
    harmonics.push({ n: h, freq: h * f0, db: 20 * Math.log10(r || 1e-12), percent: r * 100 });
  }
  let total = 0;
  for (let k = Math.ceil(20 / binHz); k <= Math.floor(Math.min(20000, fs / 2) / binHz); k++) total += power[k];
  total /= enbw;
  return {
    f0,
    levelDbfs: 10 * Math.log10(Math.max(2 * p1, 1e-15)),
    harmonics,
    thd: Math.sqrt(ph / p1),
    thdn: Math.sqrt(Math.max(0, total - p1) / p1),
    power,
    binHz,
  };
}
