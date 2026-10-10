import { useEffect, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { GraphCanvas } from '../../components/GraphCanvas';
import { drawCurve, drawGrid, plotRect, xOfFreq, yOfDb, type Plot } from '../../components/graph';
import { MeasurementSheet, useReferenceCurve, type Snapshot } from '../../components/MeasurementSheet';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, fmtDb, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { formatHz, makeBands, type BandResolution } from '../../dsp/bands';
import { TAU, msToDbfs } from '../../dsp/levels';
import { weightingDb, type Weighting } from '../../dsp/weighting';
import { getCalibration } from '../../store/calibration';
import { usePersistentState } from '../../store/persist';
import { canvasTheme } from '../../theme/theme';
import { GeneratorToolButton } from '../generator/GeneratorToolButton';

type Averaging = 'F' | 'S' | 'Leq';

export function Rta() {
  const [s, , patch] = usePersistentState('rta', {
    resolution: 3 as BandResolution,
    averaging: 'F' as Averaging,
    weighting: 'Z' as Weighting,
    maxHold: true,
    dbMax: 110,
    dbSpan: 80,
    refId: null as string | null,
  });
  const [saveOpen, setSaveOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ref = useReferenceCurve('rta', s.refId);
  const [running, setRunning] = useState(true);
  const [settings, setSettings] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [readout, setReadout] = useState({ total: -Infinity, band: -Infinity, bandMax: -Infinity });

  const fs = engine.status.sampleRate ?? 48000;
  const bands = useRef(makeBands(s.resolution, fs));
  const data = useRef({ fast: new Float64Array(0), slow: new Float64Array(0), energy: new Float64Array(0), samples: 0, max: new Float64Array(0), settle: 0 });
  const runningRef = useRef(running);
  runningRef.current = running;
  const settingsRef = useRef(s);
  settingsRef.current = s;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const resetData = (n: number) => {
    data.current = {
      fast: new Float64Array(n),
      slow: new Float64Array(n),
      energy: new Float64Array(n),
      samples: 0,
      max: new Float64Array(n),
      // Skip max-hold for ~0.5 s while the filters and averages settle.
      settle: 15,
    };
  };

  useEffect(() => {
    bands.current = makeBands(s.resolution, engine.status.sampleRate ?? 48000);
    resetData(bands.current.length);
    const release = engine.useRta(s.resolution);
    const off = engine.on('rta', (msg) => {
      if (msg.resolution !== s.resolution || !runningRef.current) return;
      const d = data.current;
      if (d.fast.length !== msg.ms.length) resetData(msg.ms.length);
      const rate = engine.status.sampleRate ?? 48000;
      const dt = msg.samples / rate;
      const aF = 1 - Math.exp(-dt / TAU.F);
      const aS = 1 - Math.exp(-dt / TAU.S);
      const settling = d.settle > 0;
      if (settling) d.settle--;
      for (let i = 0; i < msg.ms.length; i++) {
        const ms = msg.ms[i];
        d.fast[i] += aF * (ms - d.fast[i]);
        d.slow[i] += aS * (ms - d.slow[i]);
        if (!settling) d.energy[i] += ms * msg.samples;
      }
      if (!settling) d.samples += msg.samples;
      const avg = currentMs();
      if (!settling) for (let i = 0; i < avg.length; i++) if (avg[i] > d.max[i]) d.max[i] = avg[i];
      // Readouts at report rate (30 Hz) are cheap enough for React.
      const st = settingsRef.current;
      let total = 0;
      avg.forEach((ms, i) => (total += ms * 10 ** (weightingDb(st.weighting, bands.current[i].center) / 10)));
      const c = cursorRef.current;
      setReadout({
        total: msToDbfs(total) + getCalibration().offsetDb,
        band: c == null ? -Infinity : levelOf(avg[c], c),
        bandMax: c == null ? -Infinity : levelOf(d.max[c], c),
      });
    });
    return () => {
      release();
      off();
    };
  }, [s.resolution]);

  function currentMs(): Float64Array {
    const d = data.current;
    const a = settingsRef.current.averaging;
    if (a === 'F') return d.fast;
    if (a === 'S') return d.slow;
    const out = new Float64Array(d.energy.length);
    const n = Math.max(1, d.samples);
    for (let i = 0; i < out.length; i++) out[i] = d.energy[i] / n;
    return out;
  }

  function levelOf(ms: number, i: number): number {
    const b = bands.current[i];
    return msToDbfs(ms) + getCalibration().offsetDb + weightingDb(settingsRef.current.weighting, b.center);
  }

  const reset = () => resetData(bands.current.length);

  const snapshot = (): Snapshot | null => {
    const d = data.current;
    if (!d.fast.length || (!d.samples && !d.fast.some((v) => v > 0))) return null;
    const avg = currentMs();
    const bs = bands.current;
    const unit = s.weighting === 'Z' ? 'dB' : `dB${s.weighting}`;
    return {
      data: {
        kind: 'curve',
        unit,
        freqs: bs.map((b) => b.nominal),
        levels: bs.map((_, i) => +levelOf(avg[i], i).toFixed(2)),
        max: bs.map((_, i) => +levelOf(d.max[i], i).toFixed(2)),
      },
      settings: { resolution: s.resolution, averaging: s.averaging, weighting: s.weighting, offsetDb: getCalibration().offsetDb },
      lines: [`${s.resolution === 3 ? '1/3' : '1/1'} octave · ${s.averaging} · ${unit}`, `Total ${fmtDb(readout.total)} ${unit}`],
    };
  };
  const plotFor = (w: number, h: number): Plot =>
    plotRect(w, h, { fMin: 14, fMax: 28000, dbMin: s.dbMax - s.dbSpan, dbMax: s.dbMax });

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const t = canvasTheme();
    const p = plotFor(w, h);
    drawGrid(ctx, p, s.dbSpan > 60 ? 10 : 5, s.weighting === 'Z' ? 'dB' : `dB${s.weighting}`);
    const bs = bands.current;
    const avg = currentMs();
    const d = data.current;
    const step = 2 ** (1 / s.resolution);
    for (let i = 0; i < bs.length && i < avg.length; i++) {
      const b = bs[i];
      const x0 = xOfFreq(p, b.center / Math.sqrt(step));
      const x1 = xOfFreq(p, b.center * Math.sqrt(step));
      const bw = Math.max(1, x1 - x0 - (s.resolution === 3 ? 2 : 4));
      const bx = x0 + (x1 - x0 - bw) / 2;
      const y = Math.max(p.y, yOfDb(p, levelOf(avg[i], i)));
      const base = p.y + p.h;
      if (y < base) {
        ctx.fillStyle = cursor === i ? t.secondary : t.live;
        ctx.globalAlpha = cursor === i ? 1 : 0.9;
        ctx.fillRect(bx, y, bw, base - y);
        ctx.globalAlpha = 1;
      }
      if (s.maxHold && d.max[i] > 0) {
        const my = yOfDb(p, levelOf(d.max[i], i));
        if (my >= p.y && my <= base) {
          ctx.fillStyle = t.maxHold;
          ctx.fillRect(bx, my - 1, bw, 2);
        }
      }
    }
    if (ref) drawCurve(ctx, p, ref.freqs, ref.levels, t.secondary, 2);
  };

  const onPointer = (pos: { x: number; w: number; h: number } | null) => {
    if (!pos) return;
    const p = plotFor(pos.w, pos.h);
    const bs = bands.current;
    let best = 0;
    let bestD = Infinity;
    bs.forEach((b, i) => {
      const dx = Math.abs(xOfFreq(p, b.center) - pos.x);
      if (dx < bestD) {
        bestD = dx;
        best = i;
      }
    });
    setCursor(best);
  };

  const cb = cursor != null ? bands.current[cursor] : null;
  const wLabel = s.weighting === 'Z' ? 'Z' : s.weighting;

  return (
    <ModuleScreen
      title="RTA"
      chips={
        <>
          <Segmented label="Band resolution" options={[{ value: 3, label: '1/3' }, { value: 1, label: '1/1' }] as const} value={s.resolution} onChange={(resolution) => patch({ resolution })} />
          <Segmented label="Averaging" options={[{ value: 'F', label: 'Fast' }, { value: 'S', label: 'Slow' }, { value: 'Leq', label: 'Leq' }] as const} value={s.averaging} onChange={(averaging) => patch({ averaging })} />
        </>
      }
      tools={
        <>
          <ToolButton icon={running ? 'pause' : 'play'} label={running ? 'Freeze' : 'Run'} onClick={() => setRunning(!running)} active={!running} />
          <ToolButton icon="reset" label="Reset" onClick={reset} />
          <ToolButton icon="folder" label="Save" onClick={() => setSaveOpen(true)} />
          <GeneratorToolButton />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="analyzer">
          <div className="analyzer-readouts">
            <Readout size="sm" label={`Total L${wLabel}`} value={fmtDb(readout.total)} tone="live" />
            <Readout size="sm" label="Band" value={cb ? `${formatHz(cb.nominal)} Hz` : 'tap graph'} tone="dim" />
            <Readout size="sm" label="Level" value={fmtDb(readout.band)} />
            <Readout size="sm" label="Max" value={fmtDb(readout.bandMax)} tone="max" />
          </div>
          <GraphCanvas draw={draw} onPointer={onPointer} canvasRef={canvasRef} />
        </div>
      </MicGate>
      <MeasurementSheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        module="rta"
        title="RTA"
        snapshot={snapshot}
        canvas={canvasRef}
        reference={{ id: s.refId, set: (refId) => patch({ refId }) }}
      />
      <Sheet open={settings} title="RTA settings" onClose={() => setSettings(false)}>
        <Field label="Weighting" hint="Applied per band at its centre frequency.">
          <Segmented options={['Z', 'A', 'C'] as const} value={s.weighting} onChange={(weighting) => patch({ weighting })} />
        </Field>
        <Field label="Max hold">
          <Segmented options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }] as const} value={s.maxHold ? 'on' : 'off'} onChange={(v) => patch({ maxHold: v === 'on' })} />
        </Field>
        <Field label="Top of scale (dB)">
          <Segmented options={[80, 90, 100, 110, 120, 130] as const} value={s.dbMax} onChange={(dbMax) => patch({ dbMax })} />
        </Field>
        <Field label="Scale span (dB)">
          <Segmented options={[40, 60, 80, 100] as const} value={s.dbSpan} onChange={(dbSpan) => patch({ dbSpan })} />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
