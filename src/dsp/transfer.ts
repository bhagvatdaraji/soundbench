import { fftOf, ifft } from './deconvolve';
import { makeWindow, smoothOctave } from './fft';
import { fractionalCenters } from './fractionalBands';
import { nextPow2 } from './sweep';

export interface TransferResult {
  freqs: Float64Array;
  /** |H| in dB (measurement relative to reference). */
  db: Float64Array;
  /** Phase of H in degrees, wrapped to ±180. */
  phase: Float64Array;
  /** Magnitude-squared coherence 0…1. */
  coherence: Float64Array;
}

/**
 * Dual-FFT transfer function with exponential (Welch-style) averaging of the auto and cross
 * spectra: H = Gxy / Gxx, γ² = |Gxy|² / (Gxx·Gyy). x = reference, y = measurement.
 */
export class TransferAnalyzer {
  private readonly win: Float64Array;
  private gxx: Float64Array;
  private gyy: Float64Array;
  private gxyRe: Float64Array;
  private gxyIm: Float64Array;
  count = 0;

  constructor(readonly n: number, readonly fs: number) {
    this.win = makeWindow('hann', n);
    const bins = n / 2 + 1;
    this.gxx = new Float64Array(bins);
    this.gyy = new Float64Array(bins);
    this.gxyRe = new Float64Array(bins);
    this.gxyIm = new Float64Array(bins);
  }

  reset(): void {
    this.gxx.fill(0);
    this.gyy.fill(0);
    this.gxyRe.fill(0);
    this.gxyIm.fill(0);
    this.count = 0;
  }

  /** Adds one aligned frame pair. `alpha` = 0 means plain running mean over all frames. */
  add(x: ArrayLike<number>, y: ArrayLike<number>, alpha = 0): void {
    const n = this.n;
    const fft = fftOf(n);
    const xr = new Float64Array(n);
    const xi = new Float64Array(n);
    const yr = new Float64Array(n);
    const yi = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xr[i] = x[i] * this.win[i];
      yr[i] = y[i] * this.win[i];
    }
    fft.transform(xr, xi);
    fft.transform(yr, yi);
    this.count++;
    const a = alpha > 0 && this.count > 1 ? alpha : 1 / this.count;
    for (let k = 0; k <= n / 2; k++) {
      const pxx = xr[k] * xr[k] + xi[k] * xi[k];
      const pyy = yr[k] * yr[k] + yi[k] * yi[k];
      const cr = yr[k] * xr[k] + yi[k] * xi[k]; // Y·conj(X)
      const ci = yi[k] * xr[k] - yr[k] * xi[k];
      this.gxx[k] += a * (pxx - this.gxx[k]);
      this.gyy[k] += a * (pyy - this.gyy[k]);
      this.gxyRe[k] += a * (cr - this.gxyRe[k]);
      this.gxyIm[k] += a * (ci - this.gxyIm[k]);
    }
  }

  /** Fractional-octave smoothed result sampled at 1/48-octave points. */
  result(smoothing: number): TransferResult {
    const binHz = this.fs / this.n;
    const sm = (a: Float64Array) => {
      const o = new Float64Array(a.length);
      smoothOctave(a, binHz, smoothing, o);
      return o;
    };
    const gxx = sm(this.gxx);
    const gyy = sm(this.gyy);
    const re = sm(this.gxyRe);
    const im = sm(this.gxyIm);
    const freqs = fractionalCenters(48, 20, Math.min(20000, this.fs * 0.45));
    const db = new Float64Array(freqs.length);
    const phase = new Float64Array(freqs.length);
    const coherence = new Float64Array(freqs.length);
    freqs.forEach((f, i) => {
      const k = Math.min(gxx.length - 1, Math.round(f / binHz));
      const cross2 = re[k] * re[k] + im[k] * im[k];
      db[i] = 10 * Math.log10(cross2 / (gxx[k] * gxx[k] + 1e-30) + 1e-30);
      phase[i] = (Math.atan2(im[k], re[k]) * 180) / Math.PI;
      coherence[i] = Math.min(1, cross2 / (gxx[k] * gyy[k] + 1e-30));
    });
    return { freqs, db, phase, coherence };
  }
}

/**
 * Delay of y relative to x (samples, fractional) by GCC-PHAT cross-correlation, searched over
 * 0…maxLag. Also returns the normalised peak height as a quality figure (≈1 = clean).
 */
export function findDelay(x: ArrayLike<number>, y: ArrayLike<number>, maxLag: number): { lag: number; quality: number } {
  const n = nextPow2(x.length + y.length);
  const fft = fftOf(n);
  const xr = new Float64Array(n);
  const xi = new Float64Array(n);
  const yr = new Float64Array(n);
  const yi = new Float64Array(n);
  for (let i = 0; i < x.length; i++) xr[i] = x[i];
  for (let i = 0; i < y.length; i++) yr[i] = y[i];
  fft.transform(xr, xi);
  fft.transform(yr, yi);
  for (let k = 0; k < n; k++) {
    const cr = yr[k] * xr[k] + yi[k] * xi[k];
    const ci = yi[k] * xr[k] - yr[k] * xi[k];
    const m = Math.hypot(cr, ci) + 1e-20; // PHAT: keep phase only → sharp peak
    yr[k] = cr / m;
    yi[k] = ci / m;
  }
  ifft(fft, yr, yi);
  let best = 0;
  for (let l = 1; l <= Math.min(maxLag, n - 2); l++) if (yr[l] > yr[best]) best = l;
  const a = yr[Math.max(0, best - 1)];
  const b = yr[best];
  const c = yr[best + 1];
  const d = a - 2 * b + c;
  return { lag: best + (d ? (0.5 * (a - c)) / d : 0), quality: b };
}
