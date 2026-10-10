import { useRef, useState } from 'react';
import { useEngineStatus } from '../../audio/engine';
import { splLogger, useLogger } from '../../audio/splLogger';
import { GraphCanvas } from '../../components/GraphCanvas';
import { MeasurementSheet, type Snapshot } from '../../components/MeasurementSheet';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { fmtDb, Readout, Segmented, ToolButton } from '../../components/ui';
import type { LogRow } from '../../dsp/logAggregator';
import { canvasTheme } from '../../theme/theme';
import { fmtElapsed } from '../spl/useSpl';

const INTERVALS = [
  { value: 1, label: '1 s' },
  { value: 10, label: '10 s' },
  { value: 60, label: '1 min' },
] as const;

const SERIES: { key: keyof Omit<LogRow, 't'>; label: string; color: (t: ReturnType<typeof canvasTheme>) => string; width: number }[] = [
  { key: 'lcpeak', label: 'LCpeak', color: (t) => t.warn, width: 1 },
  { key: 'lafmax', label: 'LAFmax', color: (t) => t.maxHold, width: 1 },
  { key: 'laeq', label: 'LAeq', color: (t) => t.live, width: 2 },
];

export function Logger() {
  const log = useLogger();
  const { mic } = useEngineStatus();
  const [saveOpen, setSaveOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logRef = useRef(log);
  logRef.current = log;

  const last = log.rows[log.rows.length - 1];
  const elapsed = log.startedAt && last ? (last.t - log.startedAt) / 1000 : 0;

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const t = canvasTheme();
    const rows = logRef.current.rows;
    const pad = { l: 34, r: 12, t: 18, b: 20 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    ctx.font = `10px ${t.fontNum}`;
    ctx.fillStyle = t.axisLabel;
    if (!rows.length) {
      ctx.textAlign = 'center';
      ctx.fillText(logRef.current.running ? 'Waiting for the first interval…' : 'Press Start to log levels over time', w / 2, h / 2);
      return;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows)
      for (const s of SERIES) {
        if (Number.isFinite(r[s.key])) {
          lo = Math.min(lo, r[s.key]);
          hi = Math.max(hi, r[s.key]);
        }
      }
    const dbMin = Math.floor((lo - 3) / 10) * 10;
    const dbMax = Math.max(dbMin + 20, Math.ceil((hi + 3) / 10) * 10);
    const t0 = rows[0].t - logRef.current.intervalS * 1000;
    const t1 = Math.max(rows[rows.length - 1].t, t0 + 60_000);
    const X = (tm: number) => pad.l + ((tm - t0) / (t1 - t0)) * pw;
    const Y = (db: number) => pad.t + ((dbMax - db) / (dbMax - dbMin)) * ph;

    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const step = dbMax - dbMin > 50 ? 20 : 10;
    for (let d = dbMin; d <= dbMax; d += step) {
      ctx.strokeStyle = t.gridMajor;
      ctx.beginPath();
      ctx.moveTo(pad.l, Math.round(Y(d)) + 0.5);
      ctx.lineTo(pad.l + pw, Math.round(Y(d)) + 0.5);
      ctx.stroke();
      ctx.fillText(String(d), pad.l - 5, Y(d));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const span = (t1 - t0) / 1000;
    const tick = [10, 30, 60, 300, 600, 1800, 3600, 7200].find((s) => span / s <= 6) ?? 14400;
    for (let s = 0; s <= span; s += tick) {
      const x = Math.round(X(t0 + s * 1000)) + 0.5;
      ctx.strokeStyle = t.grid;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + ph);
      ctx.stroke();
      ctx.fillText(fmtElapsed(s), x, pad.t + ph + 5);
    }
    ctx.textAlign = 'left';
    ctx.fillText('dB', 4, 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();
    ctx.lineJoin = 'round';
    for (const s of SERIES) {
      ctx.strokeStyle = s.color(t);
      ctx.lineWidth = s.width;
      ctx.beginPath();
      rows.forEach((r, i) => (i ? ctx.lineTo(X(r.t), Y(r[s.key])) : ctx.moveTo(X(r.t), Y(r[s.key]))));
      if (rows.length === 1) ctx.arc(X(rows[0].t), Y(rows[0][s.key]), 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // legend
    let lx = pad.l + 6;
    ctx.textBaseline = 'top';
    for (const s of [...SERIES].reverse()) {
      ctx.fillStyle = s.color(t);
      ctx.fillRect(lx, pad.t + 6, 10, 2);
      ctx.fillText(s.label, lx + 14, pad.t + 1);
      lx += ctx.measureText(s.label).width + 28;
    }
  };

  const snapshot = (): Snapshot | null => {
    if (!log.rows.length) return null;
    return {
      data: {
        kind: 'table',
        columns: ['time', 'LAeq_dB', 'LAFmax_dB', 'LCpeak_dB'],
        rows: log.rows.map((r) => [new Date(r.t).toISOString(), +r.laeq.toFixed(1), +r.lafmax.toFixed(1), +r.lcpeak.toFixed(1)]),
      },
      settings: { intervalS: log.intervalS },
      lines: [`Interval ${log.intervalS} s · ${fmtElapsed(elapsed)}`, `LAeq ${fmtDb(log.leq)} · LAFmax ${fmtDb(log.lafmax)} · L10 ${fmtDb(log.l10)} · L90 ${fmtDb(log.l90)}`],
    };
  };

  const clear = () => {
    if (!log.rows.length || window.confirm('Clear the log?')) splLogger.clear();
  };

  return (
    <ModuleScreen
      title="SPL Logger"
      chips={<Segmented label="Interval" options={INTERVALS} value={log.intervalS as 1 | 10 | 60} onChange={(v) => splLogger.setInterval(v)} />}
      tools={
        <>
          <ToolButton
            icon={log.running ? 'stop' : 'play'}
            label={log.running ? 'Stop' : 'Start'}
            onClick={() => (log.running ? splLogger.stop() : splLogger.start())}
            active={log.running}
            disabled={mic !== 'on' && !log.running}
          />
          <ToolButton icon="reset" label="Clear" onClick={clear} />
          <ToolButton icon="folder" label="Save" onClick={() => setSaveOpen(true)} />
        </>
      }
    >
      <MicGate>
        <div className="analyzer">
          <div className="analyzer-readouts">
            <Readout size="sm" label="Elapsed" value={fmtElapsed(elapsed)} tone={log.running ? 'live' : 'dim'} />
            <Readout size="sm" label="LAeq" value={fmtDb(log.leq)} tone="live" />
            <Readout size="sm" label="LAFmax" value={fmtDb(log.lafmax)} tone="max" />
            <Readout size="sm" label="LCpeak" value={fmtDb(log.lcpeak)} tone="warn" />
            <Readout size="sm" label="L10" value={fmtDb(log.l10)} />
            <Readout size="sm" label="L90" value={fmtDb(log.l90)} />
            <Readout size="sm" label="Rows" value={String(log.rows.length)} tone="dim" />
          </div>
          <GraphCanvas draw={draw} canvasRef={canvasRef} />
          <p className="module-note">Keeps logging while you use other instruments. iOS pauses it if the screen locks or the app goes to the background.</p>
        </div>
      </MicGate>
      <MeasurementSheet open={saveOpen} onClose={() => setSaveOpen(false)} module="logger" title="SPL log" snapshot={snapshot} canvas={canvasRef} />
    </ModuleScreen>
  );
}
