import { useEffect, useRef, useState } from 'react';
import { engine, useEngineStatus } from '../../audio/engine';
import { readLatest, useCaptureRing } from '../../audio/useCaptureRing';
import { GraphCanvas } from '../../components/GraphCanvas';
import { drawGrid, plotRect, xOfFreq, yOfDb, type Plot } from '../../components/graph';
import { MeasurementSheet, type Snapshot } from '../../components/MeasurementSheet';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { analyzeDistortion, type DistortionResult } from '../../dsp/distortion';
import { formatFreq } from '../../dsp/format';
import type { GeneratorParams } from '../../dsp/generators';
import { usePersistentState } from '../../store/persist';
import { canvasTheme } from '../../theme/theme';

const N = 32768;
const FREQS = [100, 250, 1000, 5000] as const;
const LEVELS = [-24, -18, -12, -6] as const;
const fmtPct = (r: number) => (r * 100 < 0.001 ? '<0.001' : (r * 100).toFixed(r * 100 < 1 ? 3 : 2));

export function Distortion() {
  const [s, , patch] = usePersistentState('distortion', {
    source: 'internal' as 'internal' | 'external',
    freq: 1000 as (typeof FREQS)[number],
    level: -12 as (typeof LEVELS)[number],
  });
  const { generatorRunning } = useEngineStatus();
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [res, setRes] = useState<DistortionResult | null>(null);
  const ring = useCaptureRing(N * 2);
  const frame = useRef(new Float32Array(N));
  const lastRun = useRef(0);
  const prevGen = useRef<{ params: GeneratorParams; running: boolean } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sRef = useRef(s);
  sRef.current = s;

  const stopTest = () => {
    if (prevGen.current) {
      engine.setGenerator(prevGen.current.params);
      void engine.setGeneratorRunning(prevGen.current.running);
      prevGen.current = null;
    }
    setTesting(false);
  };

  const startTest = () => {
    prevGen.current = { params: engine.status.generator, running: engine.status.generatorRunning };
    engine.setGenerator({ waveform: 'sine', frequency: s.freq, level: s.level, channels: 'both' });
    void engine.setGeneratorRunning(true);
    setRes(null);
    setTesting(true);
  };

  // Retune a running test when frequency or level changes; restore the generator on exit.
  useEffect(() => {
    if (testing) engine.setGenerator({ frequency: s.freq, level: s.level });
  }, [s.freq, s.level, testing]);
  useEffect(() => () => stopTest(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Someone switched the generator off elsewhere (toolbar): end the test.
  const wasRunning = useRef(generatorRunning);
  useEffect(() => {
    if (testing && wasRunning.current && !generatorRunning) setTesting(false);
    wasRunning.current = generatorRunning;
  }, [generatorRunning, testing]);

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const now = performance.now();
    const st = sRef.current;
    const active = st.source === 'external' || testing;
    if (active && now - lastRun.current > 250 && readLatest(ring.current, frame.current)) {
      lastRun.current = now;
      const r = analyzeDistortion(frame.current, engine.status.sampleRate ?? 48000, st.source === 'internal' ? st.freq : undefined);
      setRes(r);
    }
    const t = canvasTheme();
    const p: Plot = plotRect(w, h, { fMin: 20, fMax: 20000, dbMin: -140, dbMax: 10 });
    drawGrid(ctx, p, 20, 'dB re fund.');
    if (!res) return;
    const p1 = Math.max(1e-30, Math.pow(10, res.levelDbfs / 10) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    ctx.strokeStyle = t.live;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let col = -1;
    let best = -Infinity;
    for (let k = 1; k < res.power.length; k++) {
      const f = k * res.binHz;
      if (f < p.fMin || f > p.fMax) continue;
      const X = Math.round(xOfFreq(p, f));
      const v = 10 * Math.log10(res.power[k] / p1 + 1e-30);
      if (X !== col) {
        if (col >= 0) ctx.lineTo(col, yOfDb(p, best));
        else ctx.moveTo(X, yOfDb(p, v));
        col = X;
        best = v;
      } else best = Math.max(best, v);
    }
    ctx.stroke();
    ctx.fillStyle = t.maxHold;
    ctx.font = `10px ${t.fontNum}`;
    ctx.textAlign = 'center';
    for (const hm of res.harmonics.slice(0, 6)) {
      const X = xOfFreq(p, hm.freq);
      const Y = yOfDb(p, hm.db);
      ctx.beginPath();
      ctx.arc(X, Y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`H${hm.n}`, X, Math.max(p.y + 10, Y - 8));
    }
    ctx.restore();
  };

  const snapshot = (): Snapshot | null =>
    res && {
      data: {
        kind: 'table',
        columns: ['item', 'frequency_hz', 'dB_re_fundamental', 'percent'],
        rows: [
          ['fundamental', +res.f0.toFixed(2), 0, 100],
          ...res.harmonics.map((h) => [`H${h.n}`, +h.freq.toFixed(1), +h.db.toFixed(2), +h.percent.toFixed(4)]),
          ['THD', '', +(20 * Math.log10(res.thd || 1e-12)).toFixed(2), +(res.thd * 100).toFixed(4)],
          ['THD+N', '', +(20 * Math.log10(res.thdn || 1e-12)).toFixed(2), +(res.thdn * 100).toFixed(4)],
        ],
      },
      settings: { ...s, levelDbfs: res.levelDbfs },
      lines: [`Fundamental ${formatFreq(res.f0)} at ${res.levelDbfs.toFixed(1)} dBFS`, `THD ${fmtPct(res.thd)} % · THD+N ${fmtPct(res.thdn)} %`],
    };

  const running = s.source === 'external' || testing;

  return (
    <ModuleScreen
      title="Distortion"
      showCalBadge={false}
      chips={
        <>
          <Segmented label="Source" options={[{ value: 'internal', label: 'Play tone' }, { value: 'external', label: 'External' }] as const} value={s.source} onChange={(source) => { stopTest(); patch({ source }); }} />
          {s.source === 'internal' && (
            <Segmented label="Test frequency" options={FREQS.map((f) => ({ value: f, label: f >= 1000 ? `${f / 1000}k` : String(f) }))} value={s.freq} onChange={(freq) => patch({ freq })} />
          )}
        </>
      }
      tools={
        <>
          {s.source === 'internal' && (
            <ToolButton icon={testing ? 'stop' : 'play'} label={testing ? 'Stop' : 'Start test'} onClick={() => (testing ? stopTest() : startTest())} active={testing} />
          )}
          <ToolButton icon="folder" label="Save" onClick={() => setSaveOpen(true)} />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="analyzer">
          <div className="analyzer-readouts">
            <Readout size="sm" label="THD" value={res && running ? `${fmtPct(res.thd)} %` : '–'} tone="live" />
            <Readout size="sm" label="THD dB" value={res && running ? (20 * Math.log10(res.thd || 1e-12)).toFixed(1) : '–'} />
            <Readout size="sm" label="THD+N" value={res && running ? `${fmtPct(res.thdn)} %` : '–'} tone="warn" />
            <Readout size="sm" label="Fundamental" value={res && running ? formatFreq(res.f0) : '–'} tone="dim" />
            <Readout size="sm" label="Level" value={res && running ? res.levelDbfs.toFixed(1) : '–'} unit="dBFS" tone="dim" />
          </div>
          {!running ? (
            <p className="dist-hint">
              {s.source === 'internal'
                ? 'Tap Start test to play a sine through the speaker and measure its distortion at the mic. Hold the phone close to the speaker under test, or loop an interface output back to its input.'
                : 'Play a steady sine from another device; the strongest tone is analysed.'}
            </p>
          ) : null}
          <GraphCanvas draw={draw} canvasRef={canvasRef} />
          {res && running && (
            <div className="dist-table num" role="table" aria-label="Harmonics">
              {res.harmonics.slice(0, 9).map((h) => (
                <div key={h.n} role="row" className="dist-row">
                  <span role="cell">H{h.n}</span>
                  <span role="cell">{h.db.toFixed(1)} dB</span>
                  <span role="cell">{fmtPct(h.percent / 100)} %</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </MicGate>
      <MeasurementSheet open={saveOpen} onClose={() => setSaveOpen(false)} module="distortion" title="Distortion" snapshot={snapshot} canvas={canvasRef} />
      <Sheet open={settings} title="Distortion settings" onClose={() => setSettings(false)}>
        <Field label="Test level (dBFS)" hint="Louder tests show more speaker distortion. Start low.">
          <Segmented options={LEVELS.map((l) => ({ value: l, label: String(l) }))} value={s.level} onChange={(level) => patch({ level })} />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
