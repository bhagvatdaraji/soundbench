import { describe, expect, it } from 'vitest';
import { LogAggregator } from '../logAggregator';
import { SplCore } from '../splCore';

const FS = 48000;

function feed(agg: LogAggregator, core: SplCore, amp: number, seconds: number, t0: number) {
  const rows = [];
  const block = FS / 30;
  for (let b = 0; b < seconds * 30; b++) {
    const x = new Float64Array(block);
    for (let i = 0; i < block; i++) x[i] = amp * Math.sin((2 * Math.PI * 1000 * (b * block + i)) / FS);
    core.process(x);
    const row = agg.add(core.takeReport(), 100, t0 + ((b + 1) / 30) * 1000);
    if (row) rows.push(row);
  }
  return rows;
}

describe('log aggregator', () => {
  it('emits one row per interval with LAeq, LAFmax and LCpeak', () => {
    const agg = new LogAggregator(1, FS);
    const rows = feed(agg, new SplCore(FS), 0.1, 5, 0);
    expect(rows).toHaveLength(5);
    const last = rows[4];
    // 0.1 amplitude sine = −20 dBFS → 80 dB with a 100 dB offset; peak |x| 0.1 → 80 dB
    expect(last.laeq).toBeCloseTo(80, 1);
    expect(last.lafmax).toBeCloseTo(80, 0);
    expect(last.lcpeak).toBeCloseTo(80, 1);
  });

  it('L10/L90 split a loud and a quiet half', () => {
    const agg = new LogAggregator(10, FS);
    const core = new SplCore(FS);
    feed(agg, core, 0.1, 10, 0); // −20 dBFS
    feed(agg, core, 0.01, 10, 10_000); // −40 dBFS
    expect(agg.percentile(10)).toBeCloseTo(-20, 0);
    expect(agg.percentile(90)).toBeCloseTo(-40, 0);
    // energy average of −20 and −40 halves ≈ −22.96 dBFS
    expect(agg.leqDbfs).toBeCloseTo(-22.96, 0);
  });
});
