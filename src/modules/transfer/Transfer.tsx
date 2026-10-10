import { useEffect, useRef, useState } from 'react';
import { engine, useEngineStatus } from '../../audio/engine';
import { useFrameRing } from '../../audio/frameRing';
import { systemLatencyS } from '../../audio/impulse';
import { GraphCanvas } from '../../components/GraphCanvas';
import { drawCurve, drawGrid, freqOfX, plotRect, xOfFreq } from '../../components/graph';
import { MeasurementSheet, useReferenceCurve, type Snapshot } from '../../components/MeasurementSheet';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { formatFreq } from '../../dsp/format';
import type { GeneratorParams } from '../../dsp/generators';
import { findDelay, TransferAnalyzer, type TransferResult } from '../../dsp/transfer';
import { usePersistentState } from '../../store/persist';
import { canvasTheme } from '../../theme/theme';

const N = 16384;
const RING = 4 * 48000 * 4; // ~4 s at up to 192 kHz-ish block sizes; plenty at 48 kHz
const SPEED = 343;
const AVERAGING = { fast: 0.35, medium: 0.12, slow: 0.04, infinite: 0 } as const;
type Avg = keyof typeof AVERAGING;

const fmtMs = (s: number | null) => (s == null ? '–' : (s * 1000).toFixed(2));

export function Transfer() {
  const [s, , patch] = usePersistentState('transfer', {
    smoothing: 12 as 3 | 6 | 12 | 24,
    averaging: 'medium' as Avg,
    signal: 'pink' as 'pink' | 'white',
    level: -12,
    cohBlank: 0.5,
    delayA: null as number | null,
    delayB: null as number | null,
    refId: null as string | null,
  });
  const { generatorRunning } = useEngineStatus();
  const [running, setRunning] = useState(false);
  const [delay, setDelay] = useState<{ samples: number; quality: number } | null>(null);
  const [res, setRes] = useState<TransferResult | null>(null);
  const [settings, setSettings] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [cursorHz, setCursorHz] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ref = useReferenceCurve('transfer', s.refId);

  const mic = useFrameRing('capture', RING);
  const gen = useFrameRing('ref', RING);
  const fs = engine.status.sampleRate ?? 48000;
  // The real sample rate is only known once the mic starts, so (re)build the analyzer lazily.
  const analyzerRef = useRef<TransferAnalyzer>(new TransferAnalyzer(N, fs));
  if (analyzerRef.current.fs !== fs) analyzerRef.current = new TransferAnalyzer(N, fs);
  const analyzer = analyzerRef.current;
  const prevGen = useRef<{ params: GeneratorParams; running: boolean } | null>(null);
  const lastEnd = useRef(0);
  const lastUi = useRef(0);
  const sRef = useRef(s);
  sRef.current = s;
  const delayRef = useRef(delay);
  delayRef.current = delay;
  const runningRef = useRef(running);
  runningRef.current = running;

  const stop = () => {
    if (prevGen.current) {
      engine.setGenerator(prevGen.current.params);
      void engine.setGeneratorRunning(prevGen.current.running);
      prevGen.current = null;
    }
    setRunning(false);
  };
  const start = () => {
    prevGen.current = { params: engine.status.generator, running: engine.status.generatorRunning };
    engine.setGenerator({ waveform: s.signal, level: s.level, channels: 'both' });
    void engine.setGeneratorRunning(true);
    analyzerRef.current.reset();
    setDelay(null);
    setRes(null);
    setRunning(true);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const wasGen = useRef(generatorRunning);
  useEffect(() => {
    if (running && wasGen.current && !generatorRunning) setRunning(false);
    wasGen.current = generatorRunning;
  }, [generatorRunning, running]);

  /** Cross-correlates the last ~1.4 s of reference and mic to find the total delay. */
  const measureDelay = () => {
    const fs = analyzerRef.current.fs;
    const len = Math.round(1.4 * fs);
    const x = new Float32Array(len);
    const y = new Float32Array(len);
    const end = Math.min(mic.end, gen.end);
    if (!gen.read(end, x) || !mic.read(end, y)) return false;
    const d = findDelay(x, y, Math.round(0.5 * fs));
    if (d.quality < 0.05) return false;
    setDelay({ samples: d.lag, quality: d.quality });
    analyzerRef.current.reset();
    return true;
  };

  // Main loop: auto-find the delay once there is enough signal, then keep averaging frames.
  const tick = () => {
    if (!runningRef.current) return;
    if (!delayRef.current) {
      if (Math.min(mic.end, gen.end) > 0) measureDelay();
      return;
    }
    const lag = Math.round(delayRef.current.samples);
    const endMic = Math.min(mic.end, gen.end + lag);
    if (endMic - lastEnd.current < N / 2) return; // 50 % overlap
    const x = new Float32Array(N);
    const y = new Float32Array(N);
    if (!mic.read(endMic, y) || !gen.read(endMic - lag, x)) return;
    lastEnd.current = endMic;
    const analyzer = analyzerRef.current;
    analyzer.add(x, y, AVERAGING[sRef.current.averaging]);
    const now = performance.now();
    if (now - lastUi.current > 150) {
      lastUi.current = now;
      setRes(analyzer.result(sRef.current.smoothing));
    }
  };
  useEffect(() => {
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (analyzer.count) setRes(analyzer.result(s.smoothing));
  }, [s.smoothing, analyzer]);

  const acousticDelay = delay ? delay.samples / fs - systemLatencyS() : null;

  const layout = (w: number, h: number) => {
    const magH = Math.round(h * 0.62);
    return {
      mag: plotRect(w, magH, { fMin: 20, fMax: 20000, dbMin: -24, dbMax: 12 }),
      ph: plotRect(w, h - magH, { fMin: 20, fMax: 20000, dbMin: -180, dbMax: 180 }),
      magH,
    };
  };

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const t = canvasTheme();
    const { mag, ph, magH } = layout(w, h);
    // normalise magnitude to its 200 Hz–5 kHz average so the curve sits around 0 dB
    drawGrid(ctx, mag, 6, 'dB');
    if (res) {
      let sum = 0;
      let n = 0;
      res.freqs.forEach((f, i) => {
        if (f >= 200 && f <= 5000 && res.coherence[i] > sRef.current.cohBlank) {
          sum += res.db[i];
          n++;
        }
      });
      const norm = n ? sum / n : 0;
      // coherence as a faint trace in the top quarter (1 at the top)
      const cohDb = Array.from(res.coherence, (c) => mag.dbMax - (1 - c) * (mag.dbMax - mag.dbMin) * 0.25);
      drawCurve(ctx, mag, res.freqs, cohDb, t.axisLabel, 1);
      if (ref) drawCurve(ctx, mag, ref.freqs, ref.levels, t.secondary, 1.5);
      const blanked = Array.from(res.db, (v, i) => (res.coherence[i] >= s.cohBlank ? v - norm : NaN));
      drawCurve(ctx, mag, res.freqs, blanked, t.live, 2);
    }
    ctx.save();
    ctx.translate(0, magH);
    drawGrid(ctx, ph, 90, 'phase°');
    if (res) {
      // break the line at ±180° wraps so it doesn't draw vertical jumps
      const pts = Array.from(res.phase, (v, i) => (res.coherence[i] >= s.cohBlank ? v : NaN));
      for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i] - pts[i - 1]) > 180) pts[i - 1] = NaN;
      drawCurve(ctx, ph, res.freqs, pts, t.warn, 1.5);
    }
    ctx.restore();
    if (cursorHz) {
      const X = xOfFreq(mag, cursorHz);
      ctx.strokeStyle = t.secondary;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(X, mag.y);
      ctx.lineTo(X, h - 20);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const onPointer = (pos: { x: number; w: number; h: number } | null) => {
    if (!pos) return;
    const { mag } = layout(pos.w, pos.h);
    setCursorHz(freqOfX(mag, Math.min(mag.x + mag.w, Math.max(mag.x, pos.x))));
  };

  const at = (f: number | null) => {
    if (!res || !f) return null;
    const i = Math.max(0, Math.min(res.freqs.length - 1, Math.round(48 * Math.log2(f / res.freqs[0]))));
    return { db: res.db[i], phase: res.phase[i], coh: res.coherence[i] };
  };
  const cur = at(cursorHz);
  const meanCoh = res ? avgBetween(res, 200, 5000) : null;

  const snapshot = (): Snapshot | null =>
    res && {
      data: { kind: 'curve', unit: 'dB_rel', freqs: Array.from(res.freqs, (f) => +f.toFixed(2)), levels: Array.from(res.db, (v) => +v.toFixed(2)) },
      settings: { smoothing: s.smoothing, averaging: s.averaging, delayMs: acousticDelay != null ? acousticDelay * 1000 : null },
      lines: [`Delay ${fmtMs(acousticDelay)} ms · 1/${s.smoothing} oct · ${s.averaging}`],
    };

  return (
    <ModuleScreen
      title="Transfer Function"
      showCalBadge={false}
      chips={
        <Segmented
          label="Smoothing"
          options={[{ value: 3, label: '1/3' }, { value: 6, label: '1/6' }, { value: 12, label: '1/12' }, { value: 24, label: '1/24' }] as const}
          value={s.smoothing}
          onChange={(smoothing) => patch({ smoothing })}
        />
      }
      tools={
        <>
          <ToolButton icon={running ? 'stop' : 'play'} label={running ? 'Stop' : 'Start'} onClick={() => (running ? stop() : start())} active={running} />
          <ToolButton icon="target" label="Find delay" onClick={() => measureDelay()} disabled={!running} />
          <ToolButton icon="reset" label="Reset avg" onClick={() => { analyzer.reset(); setRes(null); }} disabled={!running} />
          <ToolButton icon="folder" label="Save" onClick={() => setSaveOpen(true)} />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="analyzer">
          <div className="analyzer-readouts">
            <Readout size="sm" label="Delay" value={fmtMs(acousticDelay)} unit="ms" tone="live" />
            <Readout size="sm" label="Distance" value={acousticDelay != null ? `${(acousticDelay * SPEED).toFixed(2)} m · ${((acousticDelay * SPEED) / 0.3048).toFixed(1)} ft` : '–'} tone="dim" />
            <Readout size="sm" label="Coherence" value={meanCoh != null ? meanCoh.toFixed(2) : '–'} tone={meanCoh != null && meanCoh < 0.7 ? 'warn' : undefined} />
            <Readout size="sm" label="Averages" value={String(analyzer.count)} tone="dim" />
            {cur && <Readout size="sm" label={formatFreq(cursorHz!)} value={`${cur.db.toFixed(1)} dB · ${cur.phase.toFixed(0)}°`} tone="dim" />}
          </div>
          <div className="analyzer-readouts delay-mem">
            <button className="chip" onClick={() => patch({ delayA: acousticDelay })} disabled={acousticDelay == null}>Store A</button>
            <span className="num">A {fmtMs(s.delayA)} ms</span>
            <button className="chip" onClick={() => patch({ delayB: acousticDelay })} disabled={acousticDelay == null}>Store B</button>
            <span className="num">B {fmtMs(s.delayB)} ms</span>
            <span className="num delay-diff">
              B − A {s.delayA != null && s.delayB != null ? `${((s.delayB - s.delayA) * 1000).toFixed(2)} ms` : '–'}
            </span>
          </div>
          {!running && !res ? (
            <div className="measure-intro">
              <p>
                Plays pink noise and compares what the mic hears with what was sent: frequency response, phase and coherence, plus the delay to the speaker. Use Store A / B on
                two speakers (e.g. main and sub) to get the alignment delay.
              </p>
              <button className="btn primary" onClick={start}>Start</button>
            </div>
          ) : (
            <GraphCanvas draw={draw} onPointer={onPointer} canvasRef={canvasRef} />
          )}
        </div>
      </MicGate>
      <MeasurementSheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        module="transfer"
        title="Transfer"
        snapshot={snapshot}
        canvas={canvasRef}
        reference={{ id: s.refId, set: (refId) => patch({ refId }) }}
      />
      <Sheet open={settings} title="Transfer Function settings" onClose={() => setSettings(false)}>
        <Field label="Averaging">
          <Segmented options={[{ value: 'fast', label: 'Fast' }, { value: 'medium', label: 'Medium' }, { value: 'slow', label: 'Slow' }, { value: 'infinite', label: '∞' }] as const} value={s.averaging} onChange={(averaging) => patch({ averaging })} />
        </Field>
        <Field label="Test signal">
          <Segmented options={[{ value: 'pink', label: 'Pink noise' }, { value: 'white', label: 'White noise' }] as const} value={s.signal} onChange={(signal) => patch({ signal })} />
        </Field>
        <Field label="Signal level (dBFS)">
          <Segmented options={[-24, -18, -12, -6].map((v) => ({ value: v, label: String(v) }))} value={s.level} onChange={(level) => patch({ level })} />
        </Field>
        <Field label="Hide points below coherence" hint="Unreliable frequencies (reflections, noise) are blanked out.">
          <Segmented options={[0, 0.3, 0.5, 0.7].map((v) => ({ value: v, label: v ? String(v) : 'Off' }))} value={s.cohBlank} onChange={(cohBlank) => patch({ cohBlank })} />
        </Field>
        <p className="field-hint">
          Delay readings subtract the device's speaker→mic latency ({(systemLatencyS() * 1000).toFixed(1)} ms). Measure it once in Calibration for accurate alignment.
        </p>
      </Sheet>
    </ModuleScreen>
  );
}

function avgBetween(r: TransferResult, lo: number, hi: number): number {
  let s = 0;
  let n = 0;
  r.freqs.forEach((f, i) => {
    if (f >= lo && f <= hi) {
      s += r.coherence[i];
      n++;
    }
  });
  return n ? s / n : 0;
}

