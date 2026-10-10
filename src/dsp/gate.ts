import { smoothOctave } from './fft';
import { fftOf } from './deconvolve';
import { fractionalCenters } from './fractionalBands';

export interface GatedResponse {
  freqs: Float64Array;
  /** Magnitude in dB (relative to the IR's units). */
  db: Float64Array;
  /** Wrapped phase in degrees, relative to the gate start. */
  phase: Float64Array;
  /** Lowest frequency the gate can resolve, ≈ 1 / gate length. */
  lfLimit: number;
}

/**
 * Frequency response of a time-gated slice of an impulse response (LARSA-style): keeps the
 * direct sound and drops later reflections. Flat window over the gate with half-Hann tapers
 * (`taper` = fraction of the gate used for the fade-out; a short fixed fade-in).
 */
export function gatedResponse(
  ir: ArrayLike<number>,
  fs: number,
  start: number,
  gateS: number,
  { taper = 0.25, smoothing = 6, n = 16384 }: { taper?: number; smoothing?: number; n?: number } = {},
): GatedResponse {
  const len = Math.max(8, Math.round(gateS * fs));
  const fadeIn = Math.max(1, Math.round(0.0002 * fs));
  const fadeOut = Math.max(1, Math.round(len * taper));
  const fft = fftOf(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < Math.min(len, n); i++) {
    const s = start + i;
    if (s < 0 || s >= ir.length) continue;
    let w = 1;
    if (i < fadeIn) w = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
    else if (i >= len - fadeOut) w = 0.5 + 0.5 * Math.cos((Math.PI * (i - (len - fadeOut))) / fadeOut);
    re[i] = ir[s] * w;
  }
  fft.transform(re, im);
  const bins = n / 2 + 1;
  const binHz = fs / n;
  const power = new Float64Array(bins);
  for (let k = 0; k < bins; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  const sm = new Float64Array(bins);
  smoothOctave(power, binHz, smoothing, sm);
  const freqs = fractionalCenters(48, 20, Math.min(20000, fs * 0.45));
  const db = new Float64Array(freqs.length);
  const phase = new Float64Array(freqs.length);
  freqs.forEach((f, i) => {
    const k = Math.min(bins - 1, Math.round(f / binHz));
    db[i] = 10 * Math.log10(sm[k] + 1e-30);
    phase[i] = (Math.atan2(im[k], re[k]) * 180) / Math.PI;
  });
  return { freqs, db, phase, lfLimit: 1 / gateS };
}
