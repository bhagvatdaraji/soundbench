import { FFT } from './fft';
import { nextPow2 } from './sweep';

const ffts = new Map<number, FFT>();
export function fftOf(n: number): FFT {
  let f = ffts.get(n);
  if (!f) {
    f = new FFT(n);
    ffts.set(n, f);
  }
  return f;
}

/** In-place inverse FFT using the forward transform (conjugate trick). */
export function ifft(fft: FFT, re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft.transform(re, im);
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

/**
 * Impulse response of the system that turned `played` into `recorded`, by regularised spectral
 * division H = Y·X* / (|X|² + ε). ε is tiny inside [f1, f2] and large outside, so the result is
 * band-limited to the sweep's range instead of blowing up where the sweep had no energy.
 * Returns the causal part, `length` samples long.
 */
export function deconvolve(
  recorded: ArrayLike<number>,
  played: ArrayLike<number>,
  fs: number,
  { f1 = 20, f2 = 20000, length }: { f1?: number; f2?: number; length?: number } = {},
): Float64Array {
  const n = nextPow2(recorded.length + played.length);
  const fft = fftOf(n);
  const xr = new Float64Array(n);
  const xi = new Float64Array(n);
  const yr = new Float64Array(n);
  const yi = new Float64Array(n);
  for (let i = 0; i < played.length; i++) xr[i] = played[i];
  for (let i = 0; i < recorded.length; i++) yr[i] = recorded[i];
  fft.transform(xr, xi);
  fft.transform(yr, yi);
  const binHz = fs / n;
  let maxX2 = 0;
  for (let k = 0; k <= n / 2; k++) maxX2 = Math.max(maxX2, xr[k] * xr[k] + xi[k] * xi[k]);
  const lo = f1 * 0.9;
  const hi = Math.min(f2 * 1.05, fs / 2);
  for (let k = 0; k < n; k++) {
    const kk = k <= n / 2 ? k : n - k;
    const f = kk * binHz;
    const x2 = xr[k] * xr[k] + xi[k] * xi[k];
    const eps = f >= lo && f <= hi ? 1e-6 * maxX2 : 1e3 * maxX2;
    // Y · conj(X)
    const nr = yr[k] * xr[k] + yi[k] * xi[k];
    const ni = yi[k] * xr[k] - yr[k] * xi[k];
    yr[k] = nr / (x2 + eps);
    yi[k] = ni / (x2 + eps);
  }
  ifft(fft, yr, yi);
  return yr.slice(0, Math.min(n, length ?? recorded.length));
}
