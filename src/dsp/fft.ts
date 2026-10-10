/** In-place iterative radix-2 complex FFT with cached twiddles and bit-reversal tables. */
export class FFT {
  readonly size: number;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;

  constructor(size: number) {
    if (size & (size - 1)) throw new Error('FFT size must be a power of two');
    this.size = size;
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    this.rev = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  transform(re: Float64Array, im: Float64Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cos[k];
          const wi = this.sin[k];
          const a = i + j;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }
}

export type WindowType = 'hann' | 'hamming' | 'blackman-harris' | 'flattop' | 'rectangular';

export const WINDOW_LABELS: Record<WindowType, string> = {
  hann: 'Hann',
  hamming: 'Hamming',
  'blackman-harris': 'Blackman-Harris',
  flattop: 'Flat-top',
  rectangular: 'Rectangular',
};

export function makeWindow(type: WindowType, n: number): Float64Array {
  const w = new Float64Array(n);
  const cosSum = (a: number[]) => {
    for (let i = 0; i < n; i++) {
      const x = (2 * Math.PI * i) / n;
      let v = 0;
      for (let k = 0; k < a.length; k++) v += (k % 2 ? -1 : 1) * a[k] * Math.cos(k * x);
      w[i] = v;
    }
  };
  switch (type) {
    case 'hann': cosSum([0.5, 0.5]); break;
    case 'hamming': cosSum([0.54, 0.46]); break;
    case 'blackman-harris': cosSum([0.35875, 0.48829, 0.14128, 0.01168]); break;
    case 'flattop': cosSum([0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368]); break;
    case 'rectangular': w.fill(1); break;
  }
  return w;
}

/**
 * Single-sided power spectrum scaled so a sine of RMS r reads r² in its peak bin
 * (amplitude/coherent-gain corrected). Returns size/2 + 1 bins.
 */
export class SpectrumAnalyzer {
  readonly fft: FFT;
  private window: Float64Array;
  private scale = 1;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(readonly size: number, windowType: WindowType) {
    this.fft = new FFT(size);
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.window = makeWindow(windowType, size);
    this.setWindow(windowType);
  }

  setWindow(type: WindowType): void {
    this.window = makeWindow(type, this.size);
    let sum = 0;
    for (let i = 0; i < this.size; i++) sum += this.window[i];
    // |X|·2/sum(w) = peak amplitude → RMS² = amp²/2
    this.scale = 2 / (sum * sum);
  }

  /** `input` holds the most recent `size` samples, oldest first. */
  power(input: ArrayLike<number>, out: Float64Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      this.re[i] = input[i] * this.window[i];
      this.im[i] = 0;
    }
    this.fft.transform(this.re, this.im);
    for (let k = 0; k <= n / 2; k++) {
      out[k] = (this.re[k] * this.re[k] + this.im[k] * this.im[k]) * this.scale;
    }
    out[0] /= 2;
    out[n / 2] /= 2;
  }
}

/**
 * Fractional-octave smoothing of a power spectrum (mean power over ±1/(2·frac) octave).
 * Uses a prefix sum so it is O(bins).
 */
export function smoothOctave(power: Float64Array, binHz: number, frac: number, out: Float64Array): void {
  const n = power.length;
  if (!frac) {
    out.set(power);
    return;
  }
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + power[i];
  const half = 2 ** (1 / (2 * frac));
  for (let k = 0; k < n; k++) {
    const f = k * binHz;
    let lo = Math.floor(f / half / binHz);
    let hi = Math.ceil((f * half) / binHz);
    lo = Math.max(0, Math.min(lo, k));
    hi = Math.min(n - 1, Math.max(hi, k));
    out[k] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
  }
}

/** Parabolic interpolation around a peak bin on dB values → fractional bin offset. */
export function interpolatePeak(db: ArrayLike<number>, k: number): { offset: number; level: number } {
  if (k <= 0 || k >= db.length - 1) return { offset: 0, level: db[k] };
  const a = db[k - 1];
  const b = db[k];
  const c = db[k + 1];
  const d = a - 2 * b + c;
  if (d === 0) return { offset: 0, level: b };
  const offset = (0.5 * (a - c)) / d;
  return { offset, level: b - 0.25 * (a - c) * offset };
}
