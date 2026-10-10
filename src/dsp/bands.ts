import { cascadeMagnitude, type Biquad } from './biquad';
import type { FilterDesign } from './weighting';

export type BandResolution = 1 | 3;

export interface Band {
  /** Exact base-2 midband frequency (IEC 61260). */
  center: number;
  /** Nominal label frequency (ISO 266), e.g. 31.5, 1250. */
  nominal: number;
  lower: number;
  upper: number;
}

const NOMINAL_THIRDS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
  1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
];
const NOMINAL_OCTAVES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** Octave or 1/3-octave bands from 20 Hz to 20 kHz, below Nyquist. */
export function makeBands(resolution: BandResolution, fs: number): Band[] {
  const nominal = resolution === 3 ? NOMINAL_THIRDS : NOMINAL_OCTAVES;
  const k0 = resolution === 3 ? -17 : -5; // index of the first band relative to 1 kHz
  const half = 2 ** (1 / (2 * resolution));
  return nominal
    .map((n, i) => {
      const center = 1000 * 2 ** ((k0 + i) / resolution);
      return { center, nominal: n, lower: center / half, upper: center * half };
    })
    .filter((b) => b.center < fs * 0.45);
}

/** Label like "31.5", "1k", "1.25k". */
export function formatHz(f: number): string {
  if (f >= 1000) {
    const k = f / 1000;
    return `${Number.isInteger(k) ? k : +k.toFixed(k < 10 ? 2 : 1)}k`;
  }
  return `${+f.toFixed(f < 100 ? 1 : 0)}`;
}

type Complex = [number, number];
const cdiv = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const csqrt = ([re, im]: Complex): Complex => {
  const m = Math.hypot(re, im);
  const r = Math.sqrt((m + re) / 2);
  const i = Math.sign(im || 1) * Math.sqrt(Math.max(0, (m - re) / 2));
  return [r, i];
};

/**
 * Butterworth band-pass (order N per side, 2N poles) by analog LP→BP transform and
 * bilinear transform with pre-warped edges. Order 3 meets IEC 61260 class 1 shape.
 */
export function designBandpass(lower: number, upper: number, fs: number, order = 3): FilterDesign {
  const K = 2 * fs;
  const W1 = K * Math.tan((Math.PI * lower) / fs);
  const W2 = K * Math.tan((Math.PI * upper) / fs);
  const W0sq = W1 * W2;
  const BW = W2 - W1;
  const sections: Biquad[] = [];
  for (let k = 1; k <= order; k++) {
    const theta = (Math.PI * (2 * k + order - 1)) / (2 * order);
    const p: Complex = [Math.cos(theta), Math.sin(theta)];
    // LP→BP: s = pB/2 ± sqrt((pB/2)² − W0²)
    const a: Complex = [(p[0] * BW) / 2, (p[1] * BW) / 2];
    const root = csqrt([a[0] * a[0] - a[1] * a[1] - W0sq, 2 * a[0] * a[1]]);
    for (const s of [[a[0] + root[0], a[1] + root[1]], [a[0] - root[0], a[1] - root[1]]] as Complex[]) {
      if (s[1] <= 0) continue; // keep upper-half-plane poles; conjugates are implied
      const z = cdiv([K + s[0], s[1]], [K - s[0], -s[1]]);
      sections.push({ b0: 1, b1: 0, b2: -1, a1: -2 * z[0], a2: z[0] * z[0] + z[1] * z[1] });
    }
  }
  // Edge case: a real LP pole can map to a real BP pole pair for very wide bands.
  if (sections.length !== order) throw new Error('band too wide for this design');
  // Digital frequency whose pre-warped value is W0: the passband center.
  const center = (fs / Math.PI) * Math.atan(Math.sqrt(W0sq) / K);
  const gain = 1 / cascadeMagnitude(sections, center, fs);
  return { sections, gain };
}
