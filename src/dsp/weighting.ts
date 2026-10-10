import { bilinear, cascadeMagnitude, type Biquad } from './biquad';

export type Weighting = 'A' | 'C' | 'Z';

// IEC 61672-1 pole frequencies (Hz).
const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;

export interface FilterDesign {
  sections: Biquad[];
  gain: number;
}

/**
 * A/C frequency weighting as a biquad cascade, normalized to 0 dB at 1 kHz.
 * The 12.2 kHz double pole uses a matched-z section (no zero at Nyquist) so the
 * high-frequency rolloff tracks the analog curve at 48 kHz instead of collapsing
 * to −∞ the way a plain bilinear transform does.
 */
export function designWeighting(type: Weighting, fs: number): FilterDesign {
  if (type === 'Z') return { sections: [], gain: 1 };
  const w = (f: number) => 2 * Math.PI * f;
  const w1 = w(F1);
  const w2 = w(F2);
  const w3 = w(F3);
  const sections: Biquad[] = [];
  // s² / (s + w1)²  — low-frequency rolloff (both A and C)
  sections.push(bilinear(1, 0, 0, 1, 2 * w1, w1 * w1, fs));
  if (type === 'A') {
    // s² / ((s + w2)(s + w3))
    sections.push(bilinear(1, 0, 0, 1, w2 + w3, w2 * w3, fs));
  }
  // 1 / (s + w4)²  via matched-z (double pole at exp(-w4/fs)) plus one zero (1 + c·z⁻¹),
  // with c fitted so the top octave tracks the analog curve.
  const p = Math.exp(-w(F4) / fs);
  const fitFreqs = [4000, 6300, 8000, 10000, 12500, 16000].filter((f) => f < fs * 0.4);
  let best = { c: 0, err: Infinity };
  for (let c = 0; c <= 0.6; c += 0.0025) {
    const trial = [...sections, { b0: 1, b1: c, b2: 0, a1: -2 * p, a2: p * p }];
    const g = 1 / cascadeMagnitude(trial, 1000, fs);
    const err = Math.max(
      ...fitFreqs.map((f) => Math.abs(20 * Math.log10(cascadeMagnitude(trial, f, fs, g)) - weightingDb(type, f))),
    );
    if (err < best.err) best = { c, err };
  }
  sections.push({ b0: 1, b1: best.c, b2: 0, a1: -2 * p, a2: p * p });
  return { sections, gain: 1 / cascadeMagnitude(sections, 1000, fs) };
}

/** Analog (ideal) weighting in dB per IEC 61672-1, for display offsets and tests. */
export function weightingDb(type: Weighting, f: number): number {
  if (type === 'Z') return 0;
  const f2 = f * f;
  const r1 = F1 * F1;
  const r4 = F4 * F4;
  if (type === 'C') {
    const rc = (r4 * f2) / ((f2 + r1) * (f2 + r4));
    return 20 * Math.log10(rc) + 0.0619;
  }
  const ra =
    (r4 * f2 * f2) /
    ((f2 + r1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + r4));
  return 20 * Math.log10(ra) + 2.0;
}
