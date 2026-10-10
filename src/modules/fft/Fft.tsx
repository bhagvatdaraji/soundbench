import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { readLatest, useCaptureRing } from '../../audio/useCaptureRing';
import { GraphCanvas } from '../../components/GraphCanvas';
import { drawGrid, freqOfX, plotRect, xOfFreq, yOfDb, type Plot } from '../../components/graph';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, fmtDb, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { SpectrumAnalyzer, WINDOW_LABELS, interpolatePeak, smoothOctave, type WindowType } from '../../dsp/fft';
import { msToDbfs } from '../../dsp/levels';
import { getCalibration } from '../../store/calibration';
import { usePersistentState } from '../../store/persist';
import { canvasTheme } from '../../theme/theme';
import { formatFreq } from '../../dsp/format';
import { GeneratorToolButton } from '../generator/GeneratorToolButton';

const SIZES = [4096, 8192, 16384, 32768] as const;
const SMOOTHING = [0, 3, 6, 12, 24] as const;
const AVERAGING = { off: 0, low: 0.5, med: 0.8, high: 0.93 } as const;
type Averaging = keyof typeof AVERAGING;
const RING = 32768;
const UPDATE_MS = 50;

export function Fft() {
  const [s, , patch] = usePersistentState('fft', {
    size: 16384 as (typeof SIZES)[number],
    window: 'hann' as WindowType,
    smoothing: 0 as (typeof SMOOTHING)[number],
    averaging: 'low' as Averaging,
    maxHold: false,
    pinkTilt: false,
    dbMax: 110,
    dbSpan: 100,
  });
  const [running, setRunning] = useState(true);
  const [settings, setSettings] = useState(false);
  const [cursorHz, setCursorHz] = useState<number | null>(null);
  const [read, setRead] = useState({ peakHz: 0, peakDb: -Infinity, cursorDb: -Infinity });

  const ring = useCaptureRing(RING);
  const analyzer = useMemo(() => new SpectrumAnalyzer(s.size, s.window), [s.size, s.window]);
  const spec = useRef({ power: new Float64Array(0), avg: new Float64Array(0), smooth: new Float64Array(0), max: new Float64Array(0), db: new Float64Array(0), size: 0, fresh: true });
  const frame = useMemo(() => new Float32Array(s.size), [s.size]);
  const lastUpdate = useRef(0);
  const sRef = useRef(s);
  sRef.current = s;
  const cursorRef = useRef(cursorHz);
  cursorRef.current = cursorHz;
  const runningRef = useRef(running);
  runningRef.current = running;

  const resetSpectrum = (size = s.size) => {
    const bins = size / 2 + 1;
    spec.current = {
      power: new Float64Array(bins),
      avg: new Float64Array(bins),
      smooth: new Float64Array(bins),
      max: new Float64Array(bins),
      db: new Float64Array(bins),
      size,
      fresh: true,
    };
  };
  useEffect(() => resetSpectrum(s.size), [s.size]);

  const fs = engine.status.sampleRate ?? 48000;
  const binHz = fs / s.size;
  /** Display level of bin k: calibrated, with optional +3 dB/oct tilt so pink noise reads flat. */
  const binDb = (ms: number, k: number) => {
    let v = msToDbfs(ms) + getCalibration().offsetDb;
    if (sRef.current.pinkTilt && k > 0) v += 10 * Math.log10((k * binHz) / 1000);
    return v;
  };

  /** Recompute the spectrum from the newest samples (called from the draw loop, throttled). */
  const update = () => {
    const r = ring.current;
    const st = sRef.current;
    const sp = spec.current;
    if (sp.size !== st.size || !readLatest(r, frame)) return;
    analyzer.power(frame, sp.power);
    // Seed the average with the first frame so it doesn't ramp up from silence.
    const a = sp.fresh ? 0 : AVERAGING[st.averaging];
    sp.fresh = false;
    for (let k = 0; k < sp.power.length; k++) sp.avg[k] = a * sp.avg[k] + (1 - a) * sp.power[k];
    smoothOctave(sp.avg, binHz, st.smoothing, sp.smooth);
    let peakK = 1;
    const kMin = Math.max(1, Math.floor(20 / binHz));
    const kMax = Math.min(sp.smooth.length - 2, Math.ceil(20000 / binHz));
    for (let k = 0; k < sp.smooth.length; k++) {
      if (sp.smooth[k] > sp.max[k]) sp.max[k] = sp.smooth[k];
      sp.db[k] = binDb(sp.smooth[k], k);
      if (k >= kMin && k <= kMax && sp.smooth[k] > sp.smooth[peakK]) peakK = k;
    }
    const { offset, level } = interpolatePeak(sp.db, peakK);
    const c = cursorRef.current;
    setRead({
      peakHz: (peakK + offset) * binHz,
      peakDb: level,
      cursorDb: c == null ? -Infinity : sp.db[Math.round(c / binHz)] ?? -Infinity,
    });
  };

  const plotFor = (w: number, h: number): Plot =>
    plotRect(w, h, { fMin: 20, fMax: Math.min(20000, fs / 2), dbMin: s.dbMax - s.dbSpan, dbMax: s.dbMax });

  /** Draws a spectrum as a line, taking the max of all bins that fall in each pixel column. */
  const trace = (ctx: CanvasRenderingContext2D, p: Plot, values: Float64Array, toDb: (v: number, k: number) => number) => {
    ctx.beginPath();
    let started = false;
    const cols = Math.ceil(p.w);
    for (let c = 0; c <= cols; c++) {
      const f0 = freqOfX(p, p.x + c - 0.5);
      const f1 = freqOfX(p, p.x + c + 0.5);
      const k0 = Math.max(1, Math.floor(f0 / binHz));
      let k1 = Math.min(values.length - 1, Math.ceil(f1 / binHz));
      if (k1 < k0) k1 = k0;
      let best = -Infinity;
      if (k1 - k0 <= 1) {
        // Fewer than one bin per pixel: interpolate in frequency.
        const kf = ((f0 + f1) / 2) / binHz;
        const ka = Math.floor(kf);
        const t = kf - ka;
        const va = toDb(values[ka] ?? 0, ka);
        const vb = toDb(values[ka + 1] ?? values[ka] ?? 0, ka + 1);
        best = va + (vb - va) * t;
      } else {
        for (let k = k0; k <= k1; k++) best = Math.max(best, toDb(values[k], k));
      }
      const y = Math.min(p.y + p.h, Math.max(p.y, yOfDb(p, best)));
      const x = p.x + c;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const now = performance.now();
    if (runningRef.current && now - lastUpdate.current > UPDATE_MS) {
      lastUpdate.current = now;
      update();
    }
    const t = canvasTheme();
    const p = plotFor(w, h);
    drawGrid(ctx, p, s.dbSpan > 60 ? 10 : 5, s.pinkTilt ? 'dB (pink-flat)' : 'dB');
    const sp = spec.current;
    if (sp.size !== s.size) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    ctx.lineJoin = 'round';
    if (s.maxHold) {
      ctx.strokeStyle = t.maxHold;
      ctx.lineWidth = 1;
      trace(ctx, p, sp.max, binDb);
    }
    ctx.strokeStyle = t.live;
    ctx.lineWidth = 1.5;
    trace(ctx, p, sp.smooth, binDb);
    const c = cursorRef.current;
    if (c != null) {
      const x = xOfFreq(p, c);
      ctx.strokeStyle = t.secondary;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, p.y);
      ctx.lineTo(x, p.y + p.h);
      ctx.stroke();
    }
    ctx.restore();
  };

  const onPointer = (pos: { x: number; w: number; h: number } | null) => {
    if (!pos) return;
    const p = plotFor(pos.w, pos.h);
    const f = freqOfX(p, Math.min(p.x + p.w, Math.max(p.x, pos.x)));
    setCursorHz(f);
  };


  return (
    <ModuleScreen
      title="FFT"
      chips={
        <>
          <Segmented label="FFT size" options={SIZES.map((v) => ({ value: v, label: `${v / 1024}k` }))} value={s.size} onChange={(size) => patch({ size })} />
          <Segmented
            label="Smoothing"
            options={SMOOTHING.map((v) => ({ value: v, label: v ? `1/${v}` : 'Raw' }))}
            value={s.smoothing}
            onChange={(smoothing) => patch({ smoothing })}
          />
        </>
      }
      tools={
        <>
          <ToolButton icon={running ? 'pause' : 'play'} label={running ? 'Freeze' : 'Run'} onClick={() => setRunning(!running)} active={!running} />
          <ToolButton icon="hold" label="Max hold" onClick={() => patch({ maxHold: !s.maxHold })} active={s.maxHold} />
          <ToolButton icon="reset" label="Reset" onClick={() => resetSpectrum()} />
          <GeneratorToolButton />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="analyzer">
          <div className="analyzer-readouts">
            <Readout size="sm" label="Peak" value={read.peakDb > -200 ? formatFreq(read.peakHz) : '–'} tone="live" />
            <Readout size="sm" label="Peak level" value={fmtDb(read.peakDb)} tone="live" />
            <Readout size="sm" label="Cursor" value={cursorHz ? formatFreq(cursorHz) : 'tap graph'} tone="dim" />
            <Readout size="sm" label="Level" value={fmtDb(read.cursorDb)} />
            <Readout size="sm" label="Resolution" value={`${binHz.toFixed(2)} Hz`} tone="dim" />
          </div>
          <GraphCanvas draw={draw} onPointer={onPointer} />
        </div>
      </MicGate>
      <Sheet open={settings} title="FFT settings" onClose={() => setSettings(false)}>
        <Field label="Window" hint="Hann is a good default. Flat-top reads tone levels most accurately.">
          <Segmented options={(Object.keys(WINDOW_LABELS) as WindowType[]).map((w) => ({ value: w, label: WINDOW_LABELS[w] }))} value={s.window} onChange={(window) => patch({ window })} />
        </Field>
        <Field label="Averaging">
          <Segmented options={[{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'med', label: 'Med' }, { value: 'high', label: 'High' }] as const} value={s.averaging} onChange={(averaging) => patch({ averaging })} />
        </Field>
        <Field label="Pink-flat display" hint="Adds +3 dB per octave so pink noise reads as a flat line (like an RTA).">
          <Segmented options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] as const} value={s.pinkTilt ? 'on' : 'off'} onChange={(v) => patch({ pinkTilt: v === 'on' })} />
        </Field>
        <Field label="Top of scale (dB)">
          <Segmented options={[80, 90, 100, 110, 120, 130] as const} value={s.dbMax} onChange={(dbMax) => patch({ dbMax })} />
        </Field>
        <Field label="Scale span (dB)">
          <Segmented options={[40, 60, 80, 100, 120] as const} value={s.dbSpan} onChange={(dbSpan) => patch({ dbSpan })} />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
