import { useMemo, useRef, useState } from 'react';
import { arrivalTime, useLastImpulse } from '../../audio/impulse';
import { GraphCanvas } from '../../components/GraphCanvas';
import { drawCurve, drawGrid, drawLinGrid, drawSeries, linPlot, plotRect, xLin, xOfFreq } from '../../components/graph';
import { MeasurementSheet, useReferenceCurve, type Snapshot } from '../../components/MeasurementSheet';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Progress } from '../../components/Progress';
import { Field, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { gatedResponse } from '../../dsp/gate';
import { usePersistentState } from '../../store/persist';
import { canvasTheme } from '../../theme/theme';
import { SWEEP_LEVELS, SWEEP_OPTIONS, useImpulseRunner } from '../impulse/useImpulseRunner';

const GATES = [2.5, 5, 10, 20] as const;
const PRE_MS = 1; // gate starts this long before the direct-sound peak
const SPEED_OF_SOUND = 343;

export function Larsa() {
  const [s, , patch] = usePersistentState('larsa', {
    gateMs: 5,
    smoothing: 6 as 3 | 6 | 12,
    phase: false,
    sweepS: 1 as 1 | 2 | 4,
    level: -12 as (typeof SWEEP_LEVELS)[number],
    refId: null as string | null,
  });
  const data = useLastImpulse();
  const runner = useImpulseRunner();
  const [settings, setSettings] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ref = useReferenceCurve('larsa', s.refId);

  const res = useMemo(() => {
    if (!data) return null;
    const arr = arrivalTime(data);
    const start = arr.index - Math.round((PRE_MS / 1000) * data.fs);
    const g = gatedResponse(data.ir, data.fs, start, s.gateMs / 1000, { smoothing: s.smoothing });
    // normalise to the 500 Hz – 5 kHz average so the curve sits around 0 dB
    let sum = 0;
    let n = 0;
    g.freqs.forEach((f, i) => {
      if (f >= 500 && f <= 5000) {
        sum += g.db[i];
        n++;
      }
    });
    const norm = n ? sum / n : 0;
    let peak = 0;
    for (let i = arr.index - 200; i < arr.index + 2000 && i < data.ir.length; i++) if (i >= 0) peak = Math.max(peak, Math.abs(data.ir[i]));
    return { arr, start, g, db: Array.from(g.db, (v) => v - norm), peak };
  }, [data, s.gateMs, s.smoothing]);

  const layout = (w: number, h: number) => {
    const topH = Math.round(h * 0.34);
    return { topH, p: plotRect(w, h - topH, { fMin: 20, fMax: 20000, dbMin: -30, dbMax: 10 }) };
  };

  const irRange = (fs: number) => {
    if (!res) return null;
    const t0 = ((res.arr.index - data!.zero) / fs - data!.latencyS) * 1000; // arrival, ms
    return { t0, xMin: t0 - 2, xMax: t0 + Math.max(25, s.gateMs * 1.6) };
  };

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (!data || !res) return;
    const t = canvasTheme();
    const { topH, p } = layout(w, h);
    const r = irRange(data.fs)!;
    const lp = linPlot(w, topH, { xMin: r.xMin, xMax: r.xMax, yMin: -1, yMax: 1 });
    drawLinGrid(ctx, lp, { xUnit: 'ms', yUnit: 'IR' });
    // gate shading
    const g0 = xLin(lp, r.t0 - PRE_MS);
    const g1 = xLin(lp, r.t0 - PRE_MS + s.gateMs);
    ctx.fillStyle = 'rgba(52,211,153,0.12)';
    ctx.fillRect(g0, lp.y, g1 - g0, lp.h);
    ctx.strokeStyle = t.live;
    ctx.beginPath();
    ctx.moveTo(g1, lp.y);
    ctx.lineTo(g1, lp.y + lp.h);
    ctx.stroke();
    const x0 = (-data.zero / data.fs - data.latencyS) * 1000;
    drawSeries(ctx, lp, Float32Array.from(data.ir, (v) => v / res.peak), x0, 1000 / data.fs, t.text, 1);

    // gated response
    ctx.save();
    ctx.translate(0, topH);
    drawGrid(ctx, p, 10, 'dB');
    // below the gate's low-frequency limit the response isn't meaningful
    const lfX = xOfFreq(p, Math.max(p.fMin, res.g.lfLimit));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(p.x, p.y, lfX - p.x, p.h);
    if (ref) drawCurve(ctx, p, ref.freqs, ref.levels, t.secondary, 1.5);
    drawCurve(ctx, p, res.g.freqs, res.db, t.live, 2);
    if (s.phase) {
      // phase on the same plot: ±180° mapped to the dB range
      const toDb = (deg: number) => p.dbMin + ((deg + 180) / 360) * (p.dbMax - p.dbMin);
      drawCurve(ctx, p, res.g.freqs, Array.from(res.g.phase, toDb), t.warn, 1);
    }
    ctx.restore();
  };

  /** Drag in the IR area to set the gate length. */
  const onPointer = (pos: { x: number; y: number; w: number; h: number } | null) => {
    if (!pos || !data || !res) return;
    const { topH } = layout(pos.w, pos.h);
    if (pos.y > topH) return;
    const r = irRange(data.fs)!;
    const lp = linPlot(pos.w, topH, { xMin: r.xMin, xMax: r.xMax, yMin: -1, yMax: 1 });
    const ms = r.xMin + ((pos.x - lp.x) / lp.w) * (r.xMax - r.xMin) - (r.t0 - PRE_MS);
    patch({ gateMs: Math.max(1, Math.min(40, +ms.toFixed(1))) });
  };

  const snapshot = (): Snapshot | null =>
    res && {
      data: { kind: 'curve', unit: 'dB_rel', freqs: Array.from(res.g.freqs, (f) => +f.toFixed(2)), levels: res.db.map((v) => +v.toFixed(2)) },
      settings: { gateMs: s.gateMs, smoothing: s.smoothing },
      lines: [`Gate ${s.gateMs} ms (valid above ${Math.round(res.g.lfLimit)} Hz) · 1/${s.smoothing} oct`],
    };

  const measure = () => void runner.run({ sweepS: s.sweepS, level: s.level, averages: 1, irS: 1 });

  return (
    <ModuleScreen
      title="LARSA"
      showCalBadge={false}
      chips={
        <Segmented
          label="Gate length"
          options={GATES.map((g): { value: number; label: string } => ({ value: g, label: `${g} ms` }))}
          value={s.gateMs}
          onChange={(gateMs) => patch({ gateMs })}
        />
      }
      tools={
        <>
          <ToolButton icon="play" label={runner.measuring ? 'Measuring' : 'Measure'} onClick={measure} disabled={runner.measuring} active={runner.measuring} />
          <ToolButton icon="folder" label="Save" onClick={() => setSaveOpen(true)} />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="analyzer">
          {runner.measuring && <Progress value={runner.progress} label={runner.label} />}
          {runner.error && <p className="measure-error">{runner.error}</p>}
          {!data && !runner.measuring ? (
            <div className="measure-intro">
              <p>
                Measures a loudspeaker's own response without the room: a sweep is recorded, and only the direct sound (before the first reflection) is used. Put the mic on
                the speaker's axis, 0.5–1 m away, away from walls and the floor.
              </p>
              <button className="btn primary" onClick={measure}>Measure</button>
            </div>
          ) : res ? (
            <>
              <div className="analyzer-readouts">
                <Readout size="sm" label="Gate" value={s.gateMs.toFixed(1)} unit="ms" tone="live" />
                <Readout size="sm" label="Valid above" value={`${Math.round(res.g.lfLimit)}`} unit="Hz" />
                <Readout size="sm" label="Arrival" value={(res.arr.seconds * 1000).toFixed(2)} unit="ms" tone="dim" />
                <Readout size="sm" label="Distance" value={(res.arr.seconds * SPEED_OF_SOUND).toFixed(2)} unit="m" tone="dim" />
              </div>
              <GraphCanvas draw={draw} onPointer={onPointer} canvasRef={canvasRef} />
              <p className="module-note">Drag on the impulse to set the gate. End it just before the first reflection. Shaded frequencies are below what the gate can resolve.</p>
            </>
          ) : null}
        </div>
      </MicGate>
      <MeasurementSheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        module="larsa"
        title="LARSA"
        snapshot={snapshot}
        canvas={canvasRef}
        reference={{ id: s.refId, set: (refId) => patch({ refId }) }}
      />
      <Sheet open={settings} title="LARSA settings" onClose={() => setSettings(false)}>
        <Field label="Smoothing">
          <Segmented options={[{ value: 3, label: '1/3' }, { value: 6, label: '1/6' }, { value: 12, label: '1/12' }] as const} value={s.smoothing} onChange={(smoothing) => patch({ smoothing })} />
        </Field>
        <Field label="Show phase" hint="Phase (orange) spans −180° at the bottom to +180° at the top.">
          <Segmented options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] as const} value={s.phase ? 'on' : 'off'} onChange={(v) => patch({ phase: v === 'on' })} />
        </Field>
        <Field label="Sweep length">
          <Segmented options={SWEEP_OPTIONS} value={s.sweepS} onChange={(sweepS) => patch({ sweepS })} />
        </Field>
        <Field label="Sweep level (dBFS peak)">
          <Segmented options={SWEEP_LEVELS.map((l) => ({ value: l, label: String(l) }))} value={s.level} onChange={(level) => patch({ level })} />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
