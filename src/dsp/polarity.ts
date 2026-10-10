import { filtfilt, rbj } from './biquad';

export type PolarityVerdict = '+' | '−' | '?';

export interface PolarityResult {
  verdict: PolarityVerdict;
  /** 0…1: how much the dominant lobe outweighs the opposite one. */
  confidence: number;
}

/** Band-limit to 100 Hz – 2 kHz: the range every speaker reproduces, below cone breakup. */
function band(x: ArrayLike<number>, fs: number): Float64Array {
  return filtfilt(x, [rbj('highpass', 100, fs), rbj('highpass', 100, fs), rbj('lowpass', 2000, fs), rbj('lowpass', 2000, fs)]);
}

function judge(pos: number, neg: number, minConfidence: number): PolarityResult {
  const confidence = Math.abs(pos - neg) / (pos + neg || 1);
  const verdict: PolarityVerdict = confidence < minConfidence ? '?' : pos > neg ? '+' : '−';
  return { verdict, confidence };
}

/**
 * Polarity from an impulse response: sign of the strongest lobe of the band-limited direct
 * sound (the first few ms around the arrival).
 */
export function polarityFromIr(ir: ArrayLike<number>, fs: number, arrival: number, minConfidence = 0.2): PolarityResult {
  const a = Math.max(0, arrival - Math.round(0.002 * fs));
  const b = Math.min(ir.length, arrival + Math.round(0.004 * fs));
  // include context either side so the filters settle
  const pad = Math.round(0.02 * fs);
  const from = Math.max(0, a - pad);
  const seg = band(Array.prototype.slice.call(ir, from, Math.min(ir.length, b + pad)), fs);
  let pos = 0;
  let neg = 0;
  for (let i = a - from; i < b - from; i++) {
    if (seg[i] > pos) pos = seg[i];
    if (-seg[i] > neg) neg = -seg[i];
  }
  return judge(pos, neg, minConfidence);
}

/**
 * Polarity of incoming test pulses (another device playing the Polarity signal): the largest
 * band-limited excursion in each pulse should point the way the pulse was sent. Needs a clear
 * pulse (peak well above the RMS), otherwise reports '?'.
 */
export function polarityFromPulses(x: ArrayLike<number>, fs: number, minConfidence = 0.2): PolarityResult & { pulses: boolean } {
  const y = band(x, fs);
  let pos = 0;
  let neg = 0;
  let ms = 0;
  const skip = Math.round(0.02 * fs); // filter edges
  for (let i = skip; i < y.length - skip; i++) {
    if (y[i] > pos) pos = y[i];
    if (-y[i] > neg) neg = -y[i];
    ms += y[i] * y[i];
  }
  const rms = Math.sqrt(ms / Math.max(1, y.length - 2 * skip));
  const crest = Math.max(pos, neg) / (rms || 1e-12);
  // band-limited noise peaks at ~5× its RMS; a sparse pulse train goes well beyond that
  const pulses = crest > 7;
  const r = judge(pos, neg, minConfidence);
  return pulses ? { ...r, pulses } : { verdict: '?', confidence: 0, pulses };
}

/** One period of the Polarity test signal: a positive raised-cosine pulse, 1 ms wide. */
export function polarityPulse(fs: number): Float32Array {
  const n = Math.max(3, Math.round(0.001 * fs));
  return Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n));
}
