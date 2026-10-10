/** One second-order section, normalized so a0 = 1. */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Real-time cascade of biquads (transposed direct form II, float64 state). */
export class BiquadCascade {
  private readonly coeffs: Float64Array;
  private readonly state: Float64Array;
  readonly sections: number;

  constructor(sections: Biquad[], private gain = 1) {
    this.sections = sections.length;
    this.coeffs = new Float64Array(sections.length * 5);
    this.state = new Float64Array(sections.length * 2);
    sections.forEach((s, i) => this.coeffs.set([s.b0, s.b1, s.b2, s.a1, s.a2], i * 5));
  }

  reset(): void {
    this.state.fill(0);
  }

  processSample(x: number): number {
    const c = this.coeffs;
    const st = this.state;
    let y = x * this.gain;
    for (let i = 0, ci = 0, si = 0; i < this.sections; i++, ci += 5, si += 2) {
      const out = c[ci] * y + st[si];
      st[si] = c[ci + 1] * y - c[ci + 3] * out + st[si + 1];
      st[si + 1] = c[ci + 2] * y - c[ci + 4] * out;
      y = out;
    }
    return y;
  }
}

/** Magnitude of a cascade at frequency f (Hz), linear. */
export function cascadeMagnitude(sections: Biquad[], f: number, fs: number, gain = 1): number {
  const w = (2 * Math.PI * f) / fs;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  let mag = Math.abs(gain);
  for (const s of sections) {
    // H(e^jw) = (b0 + b1 e^-jw + b2 e^-2jw) / (1 + a1 e^-jw + a2 e^-2jw)
    const nr = s.b0 + s.b1 * c1 + s.b2 * c2;
    const ni = -(s.b1 * s1 + s.b2 * s2);
    const dr = 1 + s.a1 * c1 + s.a2 * c2;
    const di = -(s.a1 * s1 + s.a2 * s2);
    mag *= Math.hypot(nr, ni) / Math.hypot(dr, di);
  }
  return mag;
}

/**
 * Bilinear transform of an analog second-order section
 * H(s) = (B0 s² + B1 s + B2) / (A0 s² + A1 s + A2), with K = 2·fs.
 */
export function bilinear(
  B0: number, B1: number, B2: number,
  A0: number, A1: number, A2: number,
  fs: number,
): Biquad {
  const K = 2 * fs;
  const K2 = K * K;
  const a0 = A0 * K2 + A1 * K + A2;
  return {
    b0: (B0 * K2 + B1 * K + B2) / a0,
    b1: (2 * B2 - 2 * B0 * K2) / a0,
    b2: (B0 * K2 - B1 * K + B2) / a0,
    a1: (2 * A2 - 2 * A0 * K2) / a0,
    a2: (A0 * K2 - A1 * K + A2) / a0,
  };
}
