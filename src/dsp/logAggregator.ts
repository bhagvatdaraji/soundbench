import { msToDbfs } from './levels';
import type { SplReport } from './splCore';

export interface LogRow {
  /** Interval end time (ms since epoch). */
  t: number;
  /** dB SPL values for the interval (calibration applied when the row was made). */
  laeq: number;
  lafmax: number;
  lcpeak: number;
}

/**
 * Turns the SPL worklet's ~30 Hz reports into fixed-interval log rows and keeps
 * whole-session statistics (Leq, max, L10/L90 from a 0.1 dB histogram of LAF).
 */
export class LogAggregator {
  private energy = 0;
  private lafMaxMs = 0;
  private peakC = 0;
  private samples = 0;

  totalEnergy = 0;
  totalSamples = 0;
  sessionLafMaxMs = 0;
  sessionPeakC = 0;
  private hist = new Uint32Array(3000); // 0.1 dB bins from −100 dBFS
  private histCount = 0;

  constructor(
    public intervalS: number,
    private fs: number,
  ) {}

  /** Feeds one report; returns a finished row when an interval completes. */
  add(report: SplReport, offsetDb: number, now: number): LogRow | null {
    const a = report.channels.A;
    const c = report.channels.C;
    this.energy += a.energy;
    this.totalEnergy += a.energy;
    this.samples += report.samples;
    this.totalSamples += report.samples;
    this.lafMaxMs = Math.max(this.lafMaxMs, a.max.F);
    this.sessionLafMaxMs = Math.max(this.sessionLafMaxMs, a.max.F);
    this.peakC = Math.max(this.peakC, c.peak);
    this.sessionPeakC = Math.max(this.sessionPeakC, c.peak);
    const bin = Math.round((msToDbfs(a.now.F) + 100) * 10);
    this.hist[Math.max(0, Math.min(this.hist.length - 1, bin))]++;
    this.histCount++;

    if (this.samples < this.intervalS * this.fs) return null;
    const row: LogRow = {
      t: now,
      laeq: msToDbfs(this.energy / this.samples) + offsetDb,
      lafmax: msToDbfs(this.lafMaxMs) + offsetDb,
      lcpeak: 20 * Math.log10(this.peakC || 1e-9) + offsetDb,
    };
    this.energy = 0;
    this.lafMaxMs = 0;
    this.peakC = 0;
    this.samples = 0;
    return row;
  }

  /** Level exceeded n % of the time (L10, L90…), in dBFS. */
  percentile(n: number): number {
    if (!this.histCount) return -Infinity;
    const target = this.histCount * (n / 100);
    let acc = 0;
    for (let i = this.hist.length - 1; i >= 0; i--) {
      acc += this.hist[i];
      if (acc >= target) return i / 10 - 100;
    }
    return -100;
  }

  get leqDbfs(): number {
    return this.totalSamples ? msToDbfs(this.totalEnergy / this.totalSamples) : -Infinity;
  }
}
