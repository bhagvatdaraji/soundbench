/**
 * Exponential (log) sine sweep from f1 to f2 over T seconds (Farina), with short raised-cosine
 * fades so the ends don't click. `amp` is the peak amplitude.
 */
export function expSweep(fs: number, f1: number, f2: number, T: number, amp = 0.5, fadeS = 0.02): Float32Array {
  const n = Math.round(T * fs);
  const L = T / Math.log(f2 / f1);
  const x = new Float32Array(n);
  const fadeN = Math.max(1, Math.round(fadeS * fs));
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    let g = amp;
    if (i < fadeN) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeN);
    else if (i > n - 1 - fadeN) g *= 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - i)) / fadeN);
    x[i] = g * Math.sin(2 * Math.PI * f1 * L * (Math.exp(t / L) - 1));
  }
  return x;
}

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));
