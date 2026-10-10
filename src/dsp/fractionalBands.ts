export interface FractionalSpectrum {
  /** Band centre frequencies (Hz), base-2 around 1 kHz. */
  freqs: Float64Array;
  /** Mean power per band (same scale as the input bins). */
  power: Float64Array;
}

/** Centre frequencies of 1/perOct-octave bands covering [fMin, fMax]. */
export function fractionalCenters(perOct: number, fMin: number, fMax: number): Float64Array {
  const k0 = Math.ceil(perOct * Math.log2(fMin / 1000));
  const k1 = Math.floor(perOct * Math.log2(fMax / 1000));
  const out = new Float64Array(Math.max(0, k1 - k0 + 1));
  for (let k = k0; k <= k1; k++) out[k - k0] = 1000 * 2 ** (k / perOct);
  return out;
}

/**
 * Groups FFT power bins into fractional-octave bands.
 * - `mean`: average bin power, i.e. a smoothed spectrum (keeps a tone's peak-bin level).
 * - `sum`: total power in the band divided by the window's ENBW, i.e. an RTA band level
 *   (a tone reads its true level whichever bins its main lobe spreads over).
 * Where a band is narrower than one bin, the bin power is interpolated at its centre.
 */
export function groupFractional(
  power: ArrayLike<number>,
  binHz: number,
  centers: Float64Array,
  perOct: number,
  out: Float64Array = new Float64Array(centers.length),
  mode: 'mean' | 'sum' = 'mean',
  enbw = 1,
): Float64Array {
  const half = 2 ** (1 / (2 * perOct));
  const last = power.length - 1;
  for (let i = 0; i < centers.length; i++) {
    const fc = centers[i];
    const k0 = Math.ceil(fc / half / binHz);
    const k1 = Math.min(last, Math.floor((fc * half) / binHz));
    if (k1 >= k0 && k0 >= 1) {
      let sum = 0;
      for (let k = k0; k <= k1; k++) sum += power[k];
      out[i] = mode === 'sum' ? Math.max(sum / enbw, power[Math.round(fc / binHz)] ?? 0) : sum / (k1 - k0 + 1);
    } else {
      const kf = Math.min(last, fc / binHz);
      const ka = Math.floor(kf);
      const t = kf - ka;
      out[i] = power[ka] + ((power[Math.min(last, ka + 1)] ?? 0) - power[ka]) * t;
    }
  }
  return out;
}
