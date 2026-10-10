import { BiquadCascade } from './biquad';
import { designBandpass, makeBands, type Band, type BandResolution } from './bands';

/** Filter-bank RTA: accumulates Σx² per band; time weighting happens on the reader side. */
export class RtaCore {
  readonly bands: Band[];
  private readonly filters: BiquadCascade[];
  private energy: Float64Array;
  private samples = 0;

  constructor(fs: number, resolution: BandResolution) {
    this.bands = makeBands(resolution, fs);
    this.filters = this.bands.map((b) => {
      const d = designBandpass(b.lower, b.upper, fs);
      return new BiquadCascade(d.sections, d.gain);
    });
    this.energy = new Float64Array(this.bands.length);
  }

  process(input: Float32Array | Float64Array): void {
    const n = input.length;
    for (let b = 0; b < this.filters.length; b++) {
      const f = this.filters[b];
      let e = 0;
      for (let i = 0; i < n; i++) {
        const y = f.processSample(input[i]);
        e += y * y;
      }
      this.energy[b] += e;
    }
    this.samples += n;
  }

  /** Mean square per band since the last call. */
  takeMeanSquares(): { ms: Float64Array; samples: number } {
    const ms = new Float64Array(this.energy.length);
    const n = Math.max(1, this.samples);
    for (let i = 0; i < ms.length; i++) ms[i] = this.energy[i] / n;
    const samples = this.samples;
    this.energy.fill(0);
    this.samples = 0;
    return { ms, samples };
  }
}
