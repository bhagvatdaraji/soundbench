import { BiquadCascade } from './biquad';
import { designBandpass } from './bands';

/**
 * STIPA (IEC 60268-16, simplified): speech-shaped noise in seven octave bands, each intensity-
 * modulated at two frequencies. The receiver measures how much modulation survives the room
 * (MTF), converts that to a transmission index and weights the bands into one STI value.
 * Experimental: no auditory masking, reception threshold or ambient-noise corrections.
 */
export const STIPA_BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];
export const STIPA_MOD: [number, number][] = [
  [1.6, 8.0],
  [1.0, 5.0],
  [0.63, 3.15],
  [2.0, 10.0],
  [1.25, 6.25],
  [0.8, 4.0],
  [2.5, 12.5],
];
/** Approximate male-speech octave levels (dB re 500 Hz) for the test signal. */
export const STIPA_LEVELS = [-2.5, 0.5, 0, -6, -12, -18, -24];
export const STIPA_M = 0.55;
const ALPHA = [0.085, 0.127, 0.23, 0.233, 0.309, 0.224, 0.173];
const BETA = [0.085, 0.078, 0.065, 0.011, 0.047, 0.095];

/** Real-time STIPA test-signal source (one sample at a time; used by the generator). */
export class StipaSource {
  private filters: BiquadCascade[];
  private gains: number[];
  private n = 0;
  private seeds: number[];
  private norm = 1;

  constructor(private fs: number, private depth = STIPA_M) {
    this.filters = STIPA_BANDS.map((f) => {
      // half-octave carrier bands, as in the standard
      const d = designBandpass(f / 2 ** 0.25, f * 2 ** 0.25, fs);
      return new BiquadCascade(d.sections, d.gain);
    });
    this.gains = STIPA_LEVELS.map((l) => 10 ** (l / 20));
    this.seeds = STIPA_BANDS.map((_, i) => 1234567 + i * 7919);
    // normalise to unit RMS using one second of signal
    let e = 0;
    for (let i = 0; i < fs; i++) {
      const v = this.next();
      e += v * v;
    }
    this.norm = 1 / Math.sqrt(e / fs);
  }

  next(): number {
    const t = this.n++ / this.fs;
    let out = 0;
    for (let b = 0; b < 7; b++) {
      let s = this.seeds[b];
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      this.seeds[b] = s;
      const white = ((s >>> 0) / 4294967296) * 2 - 1;
      const carrier = this.filters[b].processSample(white);
      const [f1, f2] = STIPA_MOD[b];
      const intensity = Math.max(0, 1 + this.depth * (Math.sin(2 * Math.PI * f1 * t) - Math.sin(2 * Math.PI * f2 * t)));
      out += this.gains[b] * carrier * Math.sqrt(intensity);
    }
    return out * this.norm;
  }
}

export function generateStipa(fs: number, seconds: number, depth = STIPA_M): Float32Array {
  const src = new StipaSource(fs, depth);
  return Float32Array.from({ length: Math.round(seconds * fs) }, () => src.next());
}

export interface StipaResult {
  sti: number;
  /** Modulation transfer index per band. */
  mti: number[];
  /** Measured MTF per band and modulation frequency. */
  mtf: [number, number][];
  /** Band levels in dBFS, to spot a source that's too quiet. */
  bandDbfs: number[];
}

/** Analyses a recording of the STIPA signal (ideally 15–25 s). */
export function analyzeStipa(x: ArrayLike<number>, fs: number): StipaResult {
  const envRate = 200; // Hz: enough for the 12.5 Hz modulation
  const blk = Math.max(1, Math.round(fs / envRate));
  const er = fs / blk;
  // skip the first 0.5 s so filters and the room have settled
  const skip = Math.round(0.5 * fs);
  const mtf: [number, number][] = [];
  const mti: number[] = [];
  const bandDbfs: number[] = [];
  STIPA_BANDS.forEach((f, b) => {
    // steep (12-pole) octave filters so neighbouring bands' carriers don't dilute the modulation
    const d = designBandpass(f / Math.SQRT2, f * Math.SQRT2, fs, 6);
    const filt = new BiquadCascade(d.sections, d.gain);
    const env: number[] = [];
    let acc = 0;
    let k = 0;
    let total = 0;
    for (let i = 0; i < x.length; i++) {
      const y = filt.processSample(x[i]);
      if (i < skip) continue;
      acc += y * y;
      total += y * y;
      if (++k === blk) {
        env.push(acc / blk);
        acc = 0;
        k = 0;
      }
    }
    bandDbfs.push(10 * Math.log10((2 * total) / Math.max(1, x.length - skip) + 1e-30));
    const pair = STIPA_MOD[b].map((F) => {
      // use a whole number of modulation periods
      const periods = Math.floor((env.length / er) * F);
      const n = Math.max(1, Math.round((periods / F) * er));
      let re = 0;
      let im = 0;
      let sum = 0;
      for (let i = 0; i < n && i < env.length; i++) {
        const ph = (2 * Math.PI * F * i) / er;
        re += env[i] * Math.cos(ph);
        im += env[i] * Math.sin(ph);
        sum += env[i];
      }
      const m = (2 * Math.hypot(re, im)) / (sum || 1e-30);
      return Math.min(1, m / STIPA_M);
    }) as [number, number];
    mtf.push(pair);
    const ti = pair.map((m) => {
      const snr = Math.max(-15, Math.min(15, 10 * Math.log10(m / Math.max(1e-6, 1 - m))));
      return (snr + 15) / 30;
    });
    mti.push((ti[0] + ti[1]) / 2);
  });
  let sti = 0;
  for (let k = 0; k < 7; k++) sti += ALPHA[k] * mti[k];
  for (let k = 0; k < 6; k++) sti -= BETA[k] * Math.sqrt(mti[k] * mti[k + 1]);
  return { sti: Math.max(0, Math.min(1, sti)), mti, mtf, bandDbfs };
}

/** STI from analytic MTFs (e.g. m(F) = 1/√(1+(2πFT/13.8)²) for pure reverberation). */
export function stiFromMtf(m: (bandIndex: number, F: number) => number): number {
  const mti = STIPA_MOD.map(([a, b], k) => {
    const ti = [a, b].map((F) => {
      const v = Math.min(1, m(k, F));
      const snr = Math.max(-15, Math.min(15, 10 * Math.log10(v / Math.max(1e-6, 1 - v))));
      return (snr + 15) / 30;
    });
    return (ti[0] + ti[1]) / 2;
  });
  let sti = 0;
  for (let k = 0; k < 7; k++) sti += ALPHA[k] * mti[k];
  for (let k = 0; k < 6; k++) sti -= BETA[k] * Math.sqrt(mti[k] * mti[k + 1]);
  return Math.max(0, Math.min(1, sti));
}

/** IEC 60268-16 Annex F qualification band and plain-language rating. */
export function stiRating(sti: number): { band: string; label: string } {
  const bands: [number, string][] = [
    [0.76, 'A+'], [0.72, 'A'], [0.68, 'B'], [0.64, 'C'], [0.6, 'D'], [0.56, 'E'],
    [0.52, 'F'], [0.48, 'G'], [0.44, 'H'], [0.4, 'I'], [0.36, 'J'],
  ];
  const band = bands.find(([t]) => sti >= t)?.[1] ?? 'U';
  const label = sti >= 0.75 ? 'Excellent' : sti >= 0.6 ? 'Good' : sti >= 0.45 ? 'Fair' : sti >= 0.3 ? 'Poor' : 'Bad';
  return { band, label };
}
