import { useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { readLatest, useCaptureRing } from '../../audio/useCaptureRing';
import { GraphCanvas } from '../../components/GraphCanvas';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, fmtDb, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { formatFreq } from '../../dsp/format';
import { msToDbfs } from '../../dsp/levels';
import { estimateFrequency, findTrigger, type Slope } from '../../dsp/scope';
import { getCalibration } from '../../store/calibration';
import { usePersistentState } from '../../store/persist';
import { canvasTheme } from '../../theme/theme';
import { GeneratorToolButton } from '../generator/GeneratorToolButton';

const TIMEBASES = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50] as const; // ms per division
const SCALES = ['auto', 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01] as const; // full-scale fraction at top of screen
const DIV_X = 10;
const DIV_Y = 8;
const RING = 65536;
const PAD = { l: 8, r: 8, t: 8, b: 20 };
const PRE_TRIGGER = 0.1; // fraction of the screen before the trigger point
type Mode = 'auto' | 'normal' | 'free';
type Scale = (typeof SCALES)[number];

/** Rounds up to a 1-2-5 step. */
const niceCeil = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
};

export function Scope() {
  const [s, , patch] = usePersistentState('scope', {
    timebase: 1 as (typeof TIMEBASES)[number],
    scale: 'auto' as Scale,
    mode: 'auto' as Mode,
    slope: 'rising' as Slope,
    level: 0,
  });
  const [running, setRunning] = useState(true);
  const [settings, setSettings] = useState(false);
  const [read, setRead] = useState({ freq: NaN, rms: -Infinity, peak: -Infinity, triggered: false });

  const ring = useCaptureRing(RING);
  const shown = useRef<{ data: Float32Array; trig: number; at: number } | null>(null);
  const lastTrig = useRef(0);
  const autoScale = useRef(1);
  const lastRead = useRef(0);
  const sRef = useRef(s);
  sRef.current = s;
  const runningRef = useRef(running);
  runningRef.current = running;

  const fs = engine.status.sampleRate ?? 48000;

  /** Picks the samples to show this frame, honouring trigger mode. */
  const acquire = () => {
    const st = sRef.current;
    const span = Math.round((st.timebase / 1000) * DIV_X * fs);
    const search = Math.max(span, Math.round(0.05 * fs)); // look back at least 50 ms for a trigger
    const total = span + search;
    const r = ring.current;
    if (r.filled < total) return;
    const buf = new Float32Array(total);
    readLatest(r, buf);
    const pre = Math.round(span * PRE_TRIGGER);
    const now = performance.now();
    let start = -1;
    if (st.mode !== 'free') {
      // trigger must leave room for pre-trigger samples before and the rest of the screen after
      const t = findTrigger(buf, st.level, st.slope, pre + 1, total - (span - pre));
      if (t >= 0) {
        start = t - pre;
        lastTrig.current = now;
      }
    }
    const triggered = start >= 0;
    if (!triggered) {
      if (st.mode === 'normal') return; // hold the last triggered sweep
      if (st.mode === 'auto' && now - lastTrig.current < 250 && shown.current) return;
      start = total - span;
    }
    const i0 = Math.floor(start);
    const frac = start - i0;
    const data = new Float32Array(span);
    for (let i = 0; i < span; i++) {
      const a = buf[i0 + i] ?? 0;
      const b = buf[i0 + i + 1] ?? a;
      data[i] = a + (b - a) * frac;
    }
    shown.current = { data, trig: triggered ? pre : -1, at: now };

    if (now - lastRead.current > 150) {
      lastRead.current = now;
      let ms = 0;
      let pk = 0;
      for (let i = 0; i < buf.length; i++) {
        ms += buf[i] * buf[i];
        pk = Math.max(pk, Math.abs(buf[i]));
      }
      ms /= buf.length;
      autoScale.current = niceCeil(Math.max(pk * 1.1, 0.001));
      setRead({ freq: estimateFrequency(buf, fs), rms: msToDbfs(ms), peak: 20 * Math.log10(pk || 1e-9), triggered });
    }
  };

  const fullScale = () => (s.scale === 'auto' ? autoScale.current : s.scale);

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (runningRef.current) acquire();
    const t = canvasTheme();
    const pad = PAD;
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const fsc = fullScale();
    const yOf = (v: number) => pad.t + ph / 2 - (v / fsc) * (ph / 2);

    // grid
    ctx.lineWidth = 1;
    for (let i = 0; i <= DIV_X; i++) {
      const x = Math.round(pad.l + (i / DIV_X) * pw) + 0.5;
      ctx.strokeStyle = i === DIV_X / 2 ? t.gridMajor : t.grid;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + ph);
      ctx.stroke();
    }
    for (let i = 0; i <= DIV_Y; i++) {
      const y = Math.round(pad.t + (i / DIV_Y) * ph) + 0.5;
      ctx.strokeStyle = i === DIV_Y / 2 ? t.gridMajor : t.grid;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();
    }
    ctx.fillStyle = t.axisLabel;
    ctx.font = `10px ${t.fontNum}`;
    ctx.textBaseline = 'top';
    ctx.fillText(`${s.timebase} ms/div`, pad.l, pad.t + ph + 5);
    ctx.textAlign = 'right';
    ctx.fillText(`±${fsc >= 0.1 ? fsc : fsc.toExponential(0)} FS${s.scale === 'auto' ? ' (auto)' : ''}`, pad.l + pw, pad.t + ph + 5);
    ctx.textAlign = 'left';

    // trigger level marker
    if (s.mode !== 'free') {
      const ty = yOf(s.level);
      if (ty >= pad.t && ty <= pad.t + ph) {
        ctx.strokeStyle = t.warn;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.l, ty);
        ctx.lineTo(pad.l + pw, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = t.warn;
        ctx.beginPath();
        ctx.moveTo(pad.l, ty - 5);
        ctx.lineTo(pad.l + 7, ty);
        ctx.lineTo(pad.l, ty + 5);
        ctx.fill();
      }
    }

    const sh = shown.current;
    if (!sh) return;
    const d = sh.data;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();
    ctx.strokeStyle = t.live;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const perPx = d.length / pw;
    // Plain polyline until samples are dense; min/max columns beyond that.
    if (perPx <= 4) {
      for (let i = 0; i < d.length; i++) {
        const x = pad.l + (i / (d.length - 1)) * pw;
        if (i) ctx.lineTo(x, yOf(d[i]));
        else ctx.moveTo(x, yOf(d[i]));
      }
    } else {
      // min/max per pixel column so dense waveforms stay solid
      for (let c = 0; c < pw; c++) {
        const a = Math.floor(c * perPx);
        const b = Math.min(d.length, Math.floor((c + 1) * perPx) + 1);
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = a; i < b; i++) {
          if (d[i] < lo) lo = d[i];
          if (d[i] > hi) hi = d[i];
        }
        const x = pad.l + c;
        if (c) ctx.lineTo(x, yOf(hi));
        else ctx.moveTo(x, yOf(hi));
        ctx.lineTo(x, yOf(lo));
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  /** Tap the graph to set the trigger level there. */
  const onPointer = (pos: { y: number; h: number } | null) => {
    if (!pos || s.mode === 'free') return;
    const ph = pos.h - PAD.t - PAD.b;
    const mid = PAD.t + ph / 2;
    const v = ((mid - pos.y) / (ph / 2)) * fullScale();
    patch({ level: Math.max(-1, Math.min(1, +v.toFixed(4))) });
  };

  const spl = Number.isFinite(read.rms) ? read.rms + getCalibration().offsetDb : -Infinity;

  return (
    <ModuleScreen
      title="Scope"
      chips={
        <>
          <Segmented label="Time per division" options={TIMEBASES.map((v) => ({ value: v, label: v < 1 ? `${v * 1000}µ` : `${v}m` }))} value={s.timebase} onChange={(timebase) => patch({ timebase })} />
          <Segmented label="Trigger mode" options={[{ value: 'auto', label: 'Auto' }, { value: 'normal', label: 'Norm' }, { value: 'free', label: 'Free' }] as const} value={s.mode} onChange={(mode) => patch({ mode })} />
        </>
      }
      tools={
        <>
          <ToolButton icon={running ? 'pause' : 'play'} label={running ? 'Freeze' : 'Run'} onClick={() => setRunning(!running)} active={!running} />
          <GeneratorToolButton />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="analyzer">
          <div className="analyzer-readouts">
            <Readout size="sm" label="Freq" value={Number.isFinite(read.freq) ? formatFreq(read.freq) : '–'} tone="live" />
            <Readout size="sm" label="RMS" value={fmtDb(read.rms)} unit="dBFS" />
            <Readout size="sm" label="Peak" value={fmtDb(read.peak)} unit="dBFS" tone="warn" />
            <Readout size="sm" label="Level" value={fmtDb(spl)} unit="dB" tone="dim" />
            <Readout size="sm" label="Trigger" value={s.mode === 'free' ? 'free' : read.triggered ? 'trig’d' : 'waiting'} tone={read.triggered ? 'live' : 'dim'} />
          </div>
          <GraphCanvas draw={draw} onPointer={onPointer} />
        </div>
      </MicGate>
      <Sheet open={settings} title="Scope settings" onClose={() => setSettings(false)}>
        <Field label="Vertical scale" hint="Top of the screen as a fraction of full scale.">
          <Segmented options={SCALES.map((v) => ({ value: v, label: v === 'auto' ? 'Auto' : String(v) }))} value={s.scale} onChange={(scale) => patch({ scale })} />
        </Field>
        <Field label="Trigger slope">
          <Segmented options={[{ value: 'rising', label: 'Rising' }, { value: 'falling', label: 'Falling' }] as const} value={s.slope} onChange={(slope) => patch({ slope })} />
        </Field>
        <Field label={`Trigger level  ${s.level.toFixed(3)} FS`} hint="Tip: tap the graph to set the trigger level.">
          <button className="btn" onClick={() => patch({ level: 0 })}>Reset to 0</button>
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
