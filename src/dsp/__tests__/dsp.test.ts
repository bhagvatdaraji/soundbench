import { describe, expect, it } from 'vitest';
import { cascadeMagnitude } from '../biquad';
import { designBandpass, makeBands } from '../bands';
import { SpectrumAnalyzer, interpolatePeak } from '../fft';
import { DEFAULT_GENERATOR, SignalSource } from '../generators';
import { msToDbfs } from '../levels';
import { RtaCore } from '../rtaCore';
import { SplCore } from '../splCore';
import { designWeighting, weightingDb } from '../weighting';

const FS = 48000;
const db = (x: number) => 20 * Math.log10(x);

function sine(freq: number, amp: number, seconds: number, fs = FS): Float64Array {
  const n = Math.round(seconds * fs);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs);
  return out;
}

// IEC 61672-1 Table 3 nominal weightings and class 1 tolerances (+/−).
const IEC_TABLE: [number, number, number, number, number][] = [
  // f, A, C, tol+, tol−
  [31.5, -39.4, -3.0, 1.5, 1.5],
  [63, -26.2, -0.8, 1.5, 1.5],
  [125, -16.1, -0.2, 1.5, 1.5],
  [250, -8.6, 0.0, 1.4, 1.4],
  [500, -3.2, 0.0, 1.4, 1.4],
  [1000, 0.0, 0.0, 1.1, 1.1],
  [2000, 1.2, -0.2, 1.6, 1.6],
  [4000, 1.0, -0.8, 1.6, 1.6],
  [8000, -1.1, -3.0, 2.1, 3.1],
  [10000, -2.5, -4.4, 2.6, 3.6],
  [12500, -4.3, -6.2, 3.0, 6.0],
  [16000, -6.6, -8.5, 3.5, 17],
];

describe('frequency weighting', () => {
  for (const w of ['A', 'C'] as const) {
    it(`${w} matches IEC 61672 class 1 at 48 kHz`, () => {
      const d = designWeighting(w, FS);
      for (const [f, a, c, tp, tm] of IEC_TABLE) {
        const got = db(cascadeMagnitude(d.sections, f, FS, d.gain));
        const want = w === 'A' ? a : c;
        expect(got, `${w} @ ${f} Hz`).toBeGreaterThan(want - tm);
        expect(got, `${w} @ ${f} Hz`).toBeLessThan(want + tp);
        // and tracks the analog curve closely below 8 kHz
        if (f <= 8000) expect(Math.abs(got - weightingDb(w, f)), `${w} @ ${f}`).toBeLessThan(0.3);
      }
    });
  }

  it('is exactly 0 dB at 1 kHz', () => {
    for (const w of ['A', 'C'] as const) {
      const d = designWeighting(w, FS);
      expect(db(cascadeMagnitude(d.sections, 1000, FS, d.gain))).toBeCloseTo(0, 6);
      expect(weightingDb(w, 1000)).toBeCloseTo(0, 1);
    }
  });
});

describe('octave band filters', () => {
  it('third-octave bands use base-2 centres from 20 Hz to 20 kHz', () => {
    const bands = makeBands(3, FS);
    expect(bands).toHaveLength(31);
    expect(bands[17].center).toBeCloseTo(1000, 6);
    expect(bands[0].nominal).toBe(20);
    expect(bands.at(-1)!.nominal).toBe(20000);
  });

  it('band shape: 0 dB at centre, about −3 dB at edges, strong rejection an octave away', () => {
    for (const b of makeBands(3, FS)) {
      const d = designBandpass(b.lower, b.upper, FS);
      const at = (f: number) => db(cascadeMagnitude(d.sections, f, FS, d.gain));
      expect(at(b.center), `${b.nominal} centre`).toBeGreaterThan(-0.4);
      expect(at(b.center)).toBeLessThan(0.05);
      expect(at(b.lower), `${b.nominal} lower`).toBeGreaterThan(-3.5);
      expect(at(b.lower)).toBeLessThan(-2.0);
      if (b.center * 2 < FS * 0.45) expect(at(b.center * 2), `${b.nominal} +1 oct`).toBeLessThan(-30);
      expect(at(b.center / 2), `${b.nominal} −1 oct`).toBeLessThan(-30);
    }
  });

  it('RTA puts a 1 kHz tone in the 1 kHz band at the right level', () => {
    const rta = new RtaCore(FS, 3);
    rta.process(sine(1000, 0.5, 0.2)); // settle
    rta.takeMeanSquares();
    rta.process(sine(1000, 0.5, 0.5));
    const { ms } = rta.takeMeanSquares();
    const levels = Array.from(ms, msToDbfs);
    const k = rta.bands.findIndex((b) => b.nominal === 1000);
    expect(levels[k]).toBeCloseTo(db(0.5), 0);
    // 3rd-order bands reject the neighbouring band centre by ~18 dB
    expect(levels[k - 1]).toBeLessThan(levels[k] - 15);
    expect(levels[k + 1]).toBeLessThan(levels[k] - 15);
  });
});

describe('SPL core', () => {
  it('full-scale 1 kHz sine reads 0 dBFS on A, C and Z', () => {
    const spl = new SplCore(FS);
    spl.process(sine(1000, 1, 8));
    const r = spl.takeReport();
    for (const w of ['A', 'C', 'Z'] as const) {
      expect(msToDbfs(r.channels[w].now.S)).toBeCloseTo(0, 1);
      expect(msToDbfs(r.channels[w].now.F)).toBeCloseTo(0, 0);
    }
  });

  it('A-weighting attenuates 100 Hz by ~19 dB', () => {
    const spl = new SplCore(FS);
    spl.process(sine(100, 1, 8));
    const r = spl.takeReport();
    expect(msToDbfs(r.channels.A.now.S)).toBeCloseTo(-19.1, 0);
    expect(msToDbfs(r.channels.Z.now.S)).toBeCloseTo(0, 1);
  });

  it('Fast decays ~34.7 dB/s, Slow ~4.3 dB/s after the signal stops', () => {
    const spl = new SplCore(FS);
    spl.process(sine(1000, 1, 8));
    spl.process(new Float64Array(FS / 2));
    const r = spl.takeReport();
    // decay rate = 10·log10(e)/τ dB/s → 0.5 s: F ≈ −17.4 dB, S ≈ −2.2 dB
    expect(msToDbfs(r.channels.Z.now.F)).toBeCloseTo(-17.4, 0);
    expect(msToDbfs(r.channels.Z.now.S)).toBeCloseTo(-2.2, 0);
  });

  it('Leq energy and peak are reported', () => {
    const spl = new SplCore(FS);
    spl.process(sine(1000, 0.25, 1));
    const r = spl.takeReport();
    expect(msToDbfs(r.channels.Z.energy / r.samples)).toBeCloseTo(db(0.25), 1);
    expect(r.channels.Z.peak).toBeCloseTo(0.25, 2);
  });
});

describe('FFT spectrum', () => {
  for (const win of ['hann', 'flattop', 'blackman-harris', 'rectangular'] as const) {
    it(`${win}: on-bin sine level and frequency are correct`, () => {
      const n = 8192;
      const binHz = FS / n;
      const f = 300 * binHz; // exactly on a bin
      const sa = new SpectrumAnalyzer(n, win);
      const out = new Float64Array(n / 2 + 1);
      sa.power(sine(f, 0.5, n / FS), out);
      let k = 0;
      for (let i = 1; i < out.length; i++) if (out[i] > out[k]) k = i;
      expect(k).toBe(300);
      expect(msToDbfs(out[k])).toBeCloseTo(db(0.5), 1);
    });
  }

  it('flat-top reads off-bin sines within 0.1 dB and interpolation finds the frequency', () => {
    const n = 16384;
    const f = 1234.5;
    const sa = new SpectrumAnalyzer(n, 'flattop');
    const out = new Float64Array(n / 2 + 1);
    sa.power(sine(f, 0.5, n / FS), out);
    const dbs = Array.from(out, msToDbfs);
    let k = 0;
    for (let i = 1; i < dbs.length; i++) if (dbs[i] > dbs[k]) k = i;
    expect(Math.abs(dbs[k] - db(0.5))).toBeLessThan(0.1);
    const hann = new SpectrumAnalyzer(n, 'hann');
    hann.power(sine(f, 0.5, n / FS), out);
    const hd = Array.from(out, msToDbfs);
    let kh = 0;
    for (let i = 1; i < hd.length; i++) if (hd[i] > hd[kh]) kh = i;
    const { offset } = interpolatePeak(hd, kh);
    expect(Math.abs((kh + offset) * (FS / n) - f)).toBeLessThan(0.5);
  });
});

describe('signal generator', () => {
  const rmsDbfs = (wave: typeof DEFAULT_GENERATOR.waveform, seconds = 4) => {
    const src = new SignalSource(FS, { ...DEFAULT_GENERATOR, waveform: wave, level: -20 });
    src.setRunning(true);
    for (let i = 0; i < FS * 0.05; i++) src.next(); // past the fade-in
    let e = 0;
    const n = FS * seconds;
    for (let i = 0; i < n; i++) {
      const v = src.next();
      e += v * v;
    }
    return msToDbfs(e / n);
  };

  for (const w of ['sine', 'square', 'triangle', 'white', 'sweep'] as const) {
    it(`${w} at −20 dBFS has the RMS of a −20 dBFS sine`, () => {
      expect(rmsDbfs(w)).toBeCloseTo(-20, 0);
    });
  }

  it('pink noise is within 1 dB of the set level', () => {
    expect(Math.abs(rmsDbfs('pink', 10) + 20)).toBeLessThan(1);
  });

  it('pink noise is flat (±1.5 dB) across 1/3-octave bands 50 Hz–16 kHz', () => {
    const src = new SignalSource(FS, { ...DEFAULT_GENERATOR, waveform: 'pink', level: -10 });
    src.setRunning(true);
    const rta = new RtaCore(FS, 3);
    const buf = new Float64Array(FS * 20);
    for (let i = 0; i < buf.length; i++) buf[i] = src.next();
    rta.process(buf.subarray(0, FS));
    rta.takeMeanSquares();
    rta.process(buf.subarray(FS));
    const { ms } = rta.takeMeanSquares();
    const lv = rta.bands
      .map((b, i) => ({ f: b.nominal, l: msToDbfs(ms[i]) }))
      .filter((x) => x.f >= 50 && x.f <= 16000);
    const ref = lv.find((x) => x.f === 1000)!.l;
    for (const x of lv) expect(Math.abs(x.l - ref), `${x.f} Hz`).toBeLessThan(1.5);
  });
});
