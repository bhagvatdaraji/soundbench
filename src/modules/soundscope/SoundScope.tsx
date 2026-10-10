import { useMemo, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { readLatest, useCaptureRing } from '../../audio/useCaptureRing';
import { GraphCanvas } from '../../components/GraphCanvas';
import { drawGrid, freqOfX, plotRect, xOfFreq, yOfDb, type Plot } from '../../components/graph';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, fmtDb, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { SpectrumAnalyzer } from '../../dsp/fft';
import { formatFreq } from '../../dsp/format';
import { fractionalCenters, groupFractional } from '../../dsp/fractionalBands';
import { msToDbfs } from '../../dsp/levels';
import { getCalibration } from '../../store/calibration';
import { usePersistentState } from '../../store/persist';
import { canvasTheme, colorRamp } from '../../theme/theme';
import { GeneratorToolButton } from '../generator/GeneratorToolButton';

const N = 16384;
const PER_OCT = 48;
const F_MIN = 20;
const F_MAX = 20000;
const ROWS = 360; // spectrograph history (rows)
const SPEEDS = { slow: 120, normal: 60, fast: 30 } as const; // ms per row
type Speed = keyof typeof SPEEDS;

export function SoundScope() {
  const [s, , patch] = usePersistentState('soundscope', {
    floor: 30,
    ceiling: 110,
    speed: 'normal' as Speed,
    peakHold: true,
  });
  const [running, setRunning] = useState(true);
  const [settings, setSettings] = useState(false);
  const [cursorHz, setCursorHz] = useState<number | null>(null);
  const [read, setRead] = useState({ peakHz: NaN, peakDb: -Infinity, cursorDb: -Infinity });

  const fs = engine.status.sampleRate ?? 48000;
  const binHz = fs / N;
  const centers = useMemo(() => fractionalCenters(PER_OCT, F_MIN, Math.min(F_MAX, fs * 0.45)), [fs]);
  const ring = useCaptureRing(32768);
  const analyzer = useMemo(() => new SpectrumAnalyzer(N, 'hann'), []);
  const lut = useMemo(() => colorRamp(canvasTheme().heat), []);
  const st = useRef({
    frame: new Float32Array(N),
    power: new Float64Array(N / 2 + 1),
    bands: new Float64Array(centers.length),
    db: new Float64Array(centers.length).fill(-Infinity),
    hold: new Float64Array(centers.length).fill(-Infinity),
    lastRow: 0,
    lastTotal: 0,
    history: null as HTMLCanvasElement | null,
    row: null as ImageData | null,
  });
  const sRef = useRef(s);
  sRef.current = s;
  const runningRef = useRef(running);
  runningRef.current = running;
  const cursorRef = useRef(cursorHz);
  cursorRef.current = cursorHz;

  const history = () => {
    const x = st.current;
    if (!x.history || x.history.width !== centers.length) {
      x.history = document.createElement('canvas');
      x.history.width = centers.length;
      x.history.height = ROWS;
      const ctx = x.history.getContext('2d')!;
      ctx.fillStyle = canvasTheme().heat[0];
      ctx.fillRect(0, 0, centers.length, ROWS);
      x.row = ctx.createImageData(centers.length, 1);
    }
    return x.history;
  };

  /** Computes a new 1/48-octave spectrum and pushes a spectrograph row. */
  const update = () => {
    const x = st.current;
    const r = ring.current;
    // Skip the first ~0.3 s after the mic starts: the onset click would smear every band.
    if (r.total === x.lastTotal || r.total < N + fs * 0.3 || !readLatest(r, x.frame)) return;
    x.lastTotal = r.total;
    analyzer.power(x.frame, x.power);
    groupFractional(x.power, binHz, centers, PER_OCT, x.bands, 'sum', analyzer.enbw);
    const off = getCalibration().offsetDb;
    const { floor, ceiling } = sRef.current;
    let peakI = 0;
    for (let i = 0; i < centers.length; i++) {
      const d = msToDbfs(x.bands[i]) + off;
      // light smoothing so the top trace isn't jittery; the spectrograph uses raw values
      x.db[i] = Number.isFinite(x.db[i]) ? x.db[i] + 0.5 * (d - x.db[i]) : d;
      if (x.db[i] > x.hold[i]) x.hold[i] = x.db[i];
      if (x.db[i] > x.db[peakI]) peakI = i;
      const t = Math.max(0, Math.min(255, Math.round(((d - floor) / (ceiling - floor)) * 255)));
      const px = x.row!.data;
      px[i * 4] = lut[t * 3];
      px[i * 4 + 1] = lut[t * 3 + 1];
      px[i * 4 + 2] = lut[t * 3 + 2];
      px[i * 4 + 3] = 255;
    }
    // scroll the history down one row and draw the newest row on top
    const h = history();
    const hctx = h.getContext('2d')!;
    hctx.drawImage(h, 0, 0, h.width, ROWS - 1, 0, 1, h.width, ROWS - 1);
    hctx.putImageData(x.row!, 0, 0);

    // parabolic peak interpolation across neighbouring bands (log-frequency)
    const a = x.db[peakI - 1] ?? x.db[peakI];
    const b = x.db[peakI];
    const c = x.db[peakI + 1] ?? x.db[peakI];
    const den = a - 2 * b + c;
    const offset = den ? (0.5 * (a - c)) / den : 0;
    const cur = cursorRef.current;
    let curDb = -Infinity;
    if (cur != null) {
      const ci = Math.round(PER_OCT * Math.log2(cur / centers[0]));
      curDb = x.db[Math.max(0, Math.min(centers.length - 1, ci))];
    }
    setRead({ peakHz: centers[peakI] * 2 ** (offset / PER_OCT), peakDb: b - 0.25 * (a - c) * offset, cursorDb: curDb });
  };

  const layout = (w: number, h: number) => {
    const specH = Math.round(h * 0.42);
    const p: Plot = plotRect(w, specH, { fMin: F_MIN, fMax: F_MAX, dbMin: s.floor, dbMax: s.ceiling });
    const g = { x: p.x, y: specH + 4, w: p.w, h: h - specH - 8 };
    return { p, g };
  };

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const x = st.current;
    const now = performance.now();
    if (runningRef.current && now - x.lastRow >= SPEEDS[sRef.current.speed]) {
      x.lastRow = now;
      update();
    }
    const t = canvasTheme();
    const { p, g } = layout(w, h);
    drawGrid(ctx, p, s.ceiling - s.floor > 60 ? 20 : 10, 'dB');

    // spectrum (filled)
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    const base = p.y + p.h;
    const yAt = (d: number) => Math.min(base, Math.max(p.y, yOfDb(p, Number.isFinite(d) ? d : p.dbMin)));
    // Several bands share a pixel column: plot the loudest one so narrow peaks keep their height.
    const columns = (vals: Float64Array) => {
      const pts: [number, number][] = [];
      let col = -1;
      for (let i = 0; i < centers.length; i++) {
        const X = Math.round(xOfFreq(p, centers[i]));
        if (X !== col) {
          pts.push([X, vals[i]]);
          col = X;
        } else if (vals[i] > pts[pts.length - 1][1]) pts[pts.length - 1][1] = vals[i];
      }
      return pts;
    };
    ctx.lineJoin = 'round';
    const live = columns(x.db);
    ctx.beginPath();
    ctx.moveTo(live[0][0], base);
    for (const [X, d] of live) ctx.lineTo(X, yAt(d));
    ctx.lineTo(live[live.length - 1][0], base);
    ctx.closePath();
    ctx.fillStyle = t.liveDim;
    ctx.fill();
    ctx.strokeStyle = t.live;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (s.peakHold) {
      ctx.strokeStyle = t.maxHold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      columns(x.hold).forEach(([X, d], k) => (k ? ctx.lineTo(X, yAt(d)) : ctx.moveTo(X, yAt(d))));
      ctx.stroke();
    }
    ctx.restore();

    // spectrograph: band i maps linearly to x because bands are log-spaced
    const hist = history();
    const x0 = xOfFreq(p, centers[0]);
    const x1 = xOfFreq(p, centers[centers.length - 1]);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(hist, 0, 0, hist.width, hist.height, x0, g.y, x1 - x0, g.h);
    ctx.strokeStyle = t.gridMajor;
    ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w - 1, g.h - 1);

    const c = cursorRef.current;
    if (c != null) {
      const X = xOfFreq(p, c);
      ctx.strokeStyle = t.secondary;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(X, p.y);
      ctx.lineTo(X, g.y + g.h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const onPointer = (pos: { x: number; w: number; h: number } | null) => {
    if (!pos) return;
    const { p } = layout(pos.w, pos.h);
    setCursorHz(freqOfX(p, Math.min(p.x + p.w, Math.max(p.x, pos.x))));
  };

  const reset = () => {
    const x = st.current;
    x.hold.fill(-Infinity);
    x.history = null;
  };

  return (
    <ModuleScreen
      title="SoundScope"
      chips={
        <Segmented
          label="Scroll speed"
          options={[{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }] as const}
          value={s.speed}
          onChange={(speed) => patch({ speed })}
        />
      }
      tools={
        <>
          <ToolButton icon={running ? 'pause' : 'play'} label={running ? 'Freeze' : 'Run'} onClick={() => setRunning(!running)} active={!running} />
          <ToolButton icon="hold" label="Peak hold" onClick={() => patch({ peakHold: !s.peakHold })} active={s.peakHold} />
          <ToolButton icon="reset" label="Reset" onClick={reset} />
          <GeneratorToolButton />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="analyzer">
          <div className="analyzer-readouts">
            <Readout size="sm" label="Peak" value={Number.isFinite(read.peakHz) ? formatFreq(read.peakHz) : '–'} tone="live" />
            <Readout size="sm" label="Peak level" value={fmtDb(read.peakDb)} tone="live" />
            <Readout size="sm" label="Cursor" value={cursorHz ? formatFreq(cursorHz) : 'tap graph'} tone="dim" />
            <Readout size="sm" label="Level" value={fmtDb(read.cursorDb)} />
          </div>
          <GraphCanvas draw={draw} onPointer={onPointer} />
        </div>
      </MicGate>
      <Sheet open={settings} title="SoundScope settings" onClose={() => setSettings(false)}>
        <Field label="Colour floor (dB)" hint="Levels at or below this are dark.">
          <Segmented options={[0, 10, 20, 30, 40, 50, 60] as const} value={s.floor} onChange={(floor) => patch({ floor: Math.min(floor, s.ceiling - 20) })} />
        </Field>
        <Field label="Colour ceiling (dB)" hint="Levels at or above this are red.">
          <Segmented options={[70, 80, 90, 100, 110, 120, 130] as const} value={s.ceiling} onChange={(ceiling) => patch({ ceiling: Math.max(ceiling, s.floor + 20) })} />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
