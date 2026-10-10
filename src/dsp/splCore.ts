import { BiquadCascade } from './biquad';
import { TAU, expCoeff, type TimeWeighting } from './levels';
import { designWeighting, type Weighting } from './weighting';

export const WEIGHTINGS: Weighting[] = ['A', 'C', 'Z'];

/** Mean-square values for one frequency weighting, summarised over one report interval. */
export interface SplChannelReport {
  /** Current time-weighted mean square, F/S/I. */
  now: Record<TimeWeighting, number>;
  /** Max / min of each time-weighted value within the interval. */
  max: Record<TimeWeighting, number>;
  min: Record<TimeWeighting, number>;
  /** Σx² over the interval, for Leq. */
  energy: number;
  /** Largest |x| of the weighted signal in the interval. */
  peak: number;
}

export interface SplReport {
  samples: number;
  channels: Record<Weighting, SplChannelReport>;
}

const tw = <T>(f: () => T): Record<TimeWeighting, T> => ({ F: f(), S: f(), I: f() });

/** Per-sample IEC 61672 meter for A, C and Z simultaneously. Allocation-free in process(). */
export class SplCore {
  private readonly filters: Record<Weighting, BiquadCascade>;
  private readonly cF: number;
  private readonly cS: number;
  private readonly cIr: number;
  private readonly cId: number;
  private readonly state = { A: tw(() => 0), C: tw(() => 0), Z: tw(() => 0) };
  private report: SplReport;

  constructor(fs: number) {
    this.filters = {} as Record<Weighting, BiquadCascade>;
    for (const w of WEIGHTINGS) {
      const d = designWeighting(w, fs);
      this.filters[w] = new BiquadCascade(d.sections, d.gain);
    }
    this.cF = expCoeff(TAU.F, fs);
    this.cS = expCoeff(TAU.S, fs);
    this.cIr = expCoeff(TAU.I, fs);
    this.cId = expCoeff(TAU.IDecay, fs);
    this.report = this.blankReport();
  }

  private blankReport(): SplReport {
    const ch = (): SplChannelReport => ({
      now: tw(() => 0),
      max: tw(() => 0),
      min: tw(() => Infinity),
      energy: 0,
      peak: 0,
    });
    return { samples: 0, channels: { A: ch(), C: ch(), Z: ch() } };
  }

  process(input: Float32Array | Float64Array): void {
    const n = input.length;
    for (const w of WEIGHTINGS) {
      const filt = this.filters[w];
      const st = this.state[w];
      const r = this.report.channels[w];
      let { F, S, I } = st;
      let energy = 0;
      let peak = r.peak;
      let maxF = r.max.F, maxS = r.max.S, maxI = r.max.I;
      let minF = r.min.F, minS = r.min.S, minI = r.min.I;
      for (let i = 0; i < n; i++) {
        const y = filt.processSample(input[i]);
        const p = y * y;
        energy += p;
        const a = y < 0 ? -y : y;
        if (a > peak) peak = a;
        F += this.cF * (p - F);
        S += this.cS * (p - S);
        I += (p > I ? this.cIr : this.cId) * (p - I);
        if (F > maxF) maxF = F;
        if (S > maxS) maxS = S;
        if (I > maxI) maxI = I;
        if (F < minF) minF = F;
        if (S < minS) minS = S;
        if (I < minI) minI = I;
      }
      st.F = F; st.S = S; st.I = I;
      r.energy += energy;
      r.peak = peak;
      r.max.F = maxF; r.max.S = maxS; r.max.I = maxI;
      r.min.F = minF; r.min.S = minS; r.min.I = minI;
      r.now.F = F; r.now.S = S; r.now.I = I;
    }
    this.report.samples += n;
  }

  /** Returns the interval summary and starts a new interval. */
  takeReport(): SplReport {
    const r = this.report;
    this.report = this.blankReport();
    return r;
  }
}
