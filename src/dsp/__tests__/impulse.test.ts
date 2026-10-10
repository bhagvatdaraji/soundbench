import { describe, expect, it } from 'vitest';
import { deconvolve } from '../deconvolve';
import { gatedResponse } from '../gate';
import { analyzeDecay, etc, octaveBandIrs } from '../roomAcoustics';
import { expSweep } from '../sweep';

const FS = 48000;

function rand(seed = 7) {
  let s = seed;
  return () => {
    // Box–Muller gaussian
    s = (s * 16807) % 2147483647;
    const u = s / 2147483647;
    s = (s * 16807) % 2147483647;
    const v = s / 2147483647;
    return Math.sqrt(-2 * Math.log(u + 1e-12)) * Math.cos(2 * Math.PI * v);
  };
}

/** Direct sound + exponentially decaying gaussian noise (given RT60) + a noise floor. */
function syntheticRoom(rt60: number, seconds: number, floorDb = -70) {
  const g = rand();
  const n = Math.round(seconds * FS);
  const ir = new Float64Array(n);
  const t0 = 480;
  ir[t0] = 1;
  const floor = 10 ** (floorDb / 20);
  for (let i = t0 + 48; i < n; i++) ir[i] += 0.08 * g() * Math.exp((-6.9078 * (i - t0)) / FS / rt60);
  for (let i = 0; i < n; i++) ir[i] += floor * g();
  return ir;
}

describe('sweep deconvolution', () => {
  it('recovers delay and gain of a simple system', () => {
    const sweep = expSweep(FS, 20, 20000, 1, 0.5);
    const delay = 240;
    const rec = new Float64Array(sweep.length + FS / 2);
    for (let i = 0; i < sweep.length; i++) rec[i + delay] = 0.5 * sweep[i];
    const ir = deconvolve(rec, sweep, FS, { length: 4800 });
    let k = 0;
    for (let i = 0; i < ir.length; i++) if (Math.abs(ir[i]) > Math.abs(ir[k])) k = i;
    expect(k).toBe(delay);
    // band-limited (20 Hz–20 kHz) so the peak is a little under 0.5
    expect(ir[k]).toBeGreaterThan(0.4);
    expect(ir[k]).toBeLessThan(0.52);
    // and the gated response is flat in band (−6 dB ± 0.5)
    const g = gatedResponse(ir, FS, delay - 24, 0.02, { smoothing: 3 });
    g.freqs.forEach((f, i) => {
      if (f > 100 && f < 15000) expect(Math.abs(g.db[i] - 20 * Math.log10(0.5)), `${f} Hz`).toBeLessThan(0.5);
    });
  });

  it('inverted system gives a negative peak', () => {
    const sweep = expSweep(FS, 20, 20000, 0.5, 0.5);
    const rec = new Float64Array(sweep.length + 4800);
    for (let i = 0; i < sweep.length; i++) rec[i + 100] = -sweep[i];
    const ir = deconvolve(rec, sweep, FS, { length: 2000 });
    let k = 0;
    for (let i = 0; i < ir.length; i++) if (Math.abs(ir[i]) > Math.abs(ir[k])) k = i;
    expect(ir[k]).toBeLessThan(0);
  });
});

describe('room acoustics', () => {
  for (const rt of [0.4, 1.2]) {
    it(`T20/T30/EDT of a synthetic room with RT60 = ${rt} s are within 5 %`, () => {
      const a = analyzeDecay(syntheticRoom(rt, rt * 2.5), FS);
      expect(Math.abs(a.t20 / rt - 1)).toBeLessThan(0.05);
      expect(Math.abs(a.t30 / rt - 1)).toBeLessThan(0.05);
      // EDT includes the direct sound, so it reads shorter than the diffuse RT
      expect(a.edt).toBeLessThan(rt * 1.05);
      expect(a.snr).toBeGreaterThan(40);
    });
  }

  it('octave bands keep the decay rate', () => {
    const bands = octaveBandIrs(syntheticRoom(0.8, 2), FS);
    for (const b of bands.filter((x) => x.center >= 250)) {
      const a = analyzeDecay(b.ir, FS);
      expect(Math.abs(a.t30 / 0.8 - 1), `${b.center} Hz`).toBeLessThan(0.1);
    }
  });

  it('C80, D50 and centre time of two reflections', () => {
    const ir = new Float64Array(FS);
    ir[1000] = 1; // direct, energy 1
    ir[1000 + 0.1 * FS] = 0.5; // reflection at +100 ms, energy 0.25
    const a = analyzeDecay(ir, FS);
    expect(a.c80).toBeCloseTo(10 * Math.log10(1 / 0.25), 2);
    expect(a.c50).toBeCloseTo(a.c80, 2);
    expect(a.d50).toBeCloseTo(1 / 1.25, 3);
    expect(a.ts).toBeCloseTo((0.25 * 0.1) / 1.25, 4);
  });

  it('ETC peaks at 0 dB where the IR peaks', () => {
    const ir = syntheticRoom(0.5, 1);
    const e = etc(ir);
    let k = 0;
    for (let i = 0; i < e.length; i++) if (e[i] > e[k]) k = i;
    expect(Math.abs(k - 480)).toBeLessThan(3);
    expect(e[k]).toBeCloseTo(0, 5);
  });
});
