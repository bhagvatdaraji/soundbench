import { useMemo, useRef, useState } from 'react';
import { arrivalTime, useLastImpulse } from '../../audio/impulse';
import { GraphCanvas } from '../../components/GraphCanvas';
import { drawLinGrid, drawSeries, linPlot, xLin, yLin } from '../../components/graph';
import { MeasurementSheet, type Snapshot } from '../../components/MeasurementSheet';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Progress } from '../../components/Progress';
import { Field, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { formatHz } from '../../dsp/bands';
import { analyzeDecay, etc, octaveBandIrs, type DecayAnalysis } from '../../dsp/roomAcoustics';
import { shareOrDownload } from '../../export/share';
import { wavFloat32 } from '../../export/wav';
import { usePersistentState } from '../../store/persist';
import { canvasTheme } from '../../theme/theme';
import { SWEEP_LEVELS, SWEEP_OPTIONS, useImpulseRunner } from './useImpulseRunner';

type View = 'ir' | 'etc' | 'decay' | 'metrics';
const fmtS = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–');
const fmtDb1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '–');

const METRIC_ROWS: { key: keyof DecayAnalysis; label: string; fmt: (v: number) => string; unit: string }[] = [
  { key: 'edt', label: 'EDT', fmt: fmtS, unit: 's' },
  { key: 't20', label: 'T20', fmt: fmtS, unit: 's' },
  { key: 't30', label: 'T30', fmt: fmtS, unit: 's' },
  { key: 'c50', label: 'C50', fmt: fmtDb1, unit: 'dB' },
  { key: 'c80', label: 'C80', fmt: fmtDb1, unit: 'dB' },
  { key: 'd50', label: 'D50', fmt: (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(0)}` : '–'), unit: '%' },
  { key: 'ts', label: 'Ts', fmt: (v) => (Number.isFinite(v) ? (v * 1000).toFixed(0) : '–'), unit: 'ms' },
  { key: 'snr', label: 'S/N', fmt: fmtDb1, unit: 'dB' },
];

export function Impulse() {
  const [s, , patch] = usePersistentState('impulse', { sweepS: 2 as 1 | 2 | 4, level: -12 as (typeof SWEEP_LEVELS)[number], averages: 1 as 1 | 2 | 4, view: 'etc' as View, band: 0 });
  const runner = useImpulseRunner();
  const data = useLastImpulse();
  const [settings, setSettings] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const analysis = useMemo(() => {
    if (!data) return null;
    const ir = data.ir.subarray(data.zero);
    const wide = analyzeDecay(ir, data.fs);
    const bands = octaveBandIrs(ir, data.fs).map((b) => ({ center: b.center, a: analyzeDecay(b.ir, data.fs) }));
    const env = etc(ir, Math.round(data.fs * 0.0005)); // 0.5 ms smoothing
    let peak = 0;
    for (let i = 0; i < ir.length; i++) peak = Math.max(peak, Math.abs(ir[i]));
    return { ir, wide, bands, env, peak, arrival: arrivalTime(data) };
  }, [data]);

  const measure = () => void runner.run({ sweepS: s.sweepS, level: s.level, averages: s.averages });

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (!data || !analysis) return;
    const t = canvasTheme();
    const fs = data.fs;
    const { wide } = analysis;
    // time axis in ms from playback start (latency removed)
    const t0 = (wide.start / fs - data.latencyS) * 1000;
    const rt = Number.isFinite(wide.t30) ? wide.t30 : Number.isFinite(wide.t20) ? wide.t20 : 0.5;
    const xMin = Math.max(-data.latencyS * 1000, t0 - 5);
    const xMax = t0 + Math.min(analysis.ir.length / fs, Math.max(0.08, rt * 1.3)) * 1000;
    const x0 = -data.latencyS * 1000;
    const dx = 1000 / fs;
    if (s.view === 'ir') {
      const p = linPlot(w, h, { xMin, xMax, yMin: -1, yMax: 1 });
      drawLinGrid(ctx, p, { xUnit: 'ms', yUnit: 'IR (norm.)' });
      const norm = Float32Array.from(analysis.ir, (v) => v / analysis.peak);
      drawSeries(ctx, p, norm, x0, dx, t.live, 1);
    } else if (s.view === 'etc') {
      const p = linPlot(w, h, { xMin, xMax, yMin: -80, yMax: 0 });
      drawLinGrid(ctx, p, { xUnit: 'ms', yUnit: 'dB' });
      drawSeries(ctx, p, analysis.env, x0, dx, t.live, 1);
      // noise floor and integration end
      ctx.strokeStyle = t.warn;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p.x, yLin(p, wide.noiseDb));
      ctx.lineTo(p.x + p.w, yLin(p, wide.noiseDb));
      ctx.stroke();
      const xe = xLin(p, x0 + wide.end * dx);
      ctx.strokeStyle = t.maxHold;
      ctx.beginPath();
      ctx.moveTo(xe, p.y);
      ctx.lineTo(xe, p.y + p.h);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (s.view === 'decay') {
      const sel = s.band === 0 ? wide : analysis.bands[s.band - 1]?.a ?? wide;
      const p = linPlot(w, h, { xMin: 0, xMax: Math.max(0.1, Math.min(analysis.ir.length / fs, rt * 1.4)) * 1000, yMin: -70, yMax: 0 });
      drawLinGrid(ctx, p, { xUnit: 'ms from direct sound', yUnit: 'dB' });
      // shade the T30 evaluation range
      ctx.fillStyle = 'rgba(56,189,248,0.08)';
      ctx.fillRect(p.x, yLin(p, -5), p.w, yLin(p, -35) - yLin(p, -5));
      drawSeries(ctx, p, sel.schroeder, 0, (1000 * sel.step) / fs, t.live, 2);
      if (s.band !== 0) drawSeries(ctx, p, wide.schroeder, 0, (1000 * wide.step) / fs, t.gridMajor, 1);
    }
  };

  const snapshot = (): Snapshot | null => {
    if (!analysis) return null;
    const cols = ['Wide', ...analysis.bands.map((b) => `${formatHz(b.center)} Hz`)];
    const all = [analysis.wide, ...analysis.bands.map((b) => b.a)];
    return {
      data: {
        kind: 'table',
        columns: ['metric', ...cols],
        rows: METRIC_ROWS.map((r) => [`${r.label} (${r.unit})`, ...all.map((a) => r.fmt(a[r.key] as number))]),
      },
      settings: { sweepS: data?.sweepS, arrivalMs: analysis.arrival.seconds * 1000 },
      lines: [`T30 ${fmtS(analysis.wide.t30)} s · EDT ${fmtS(analysis.wide.edt)} s · C80 ${fmtDb1(analysis.wide.c80)} dB · D50 ${METRIC_ROWS[5].fmt(analysis.wide.d50)} %`],
    };
  };

  const exportWav = () => {
    if (data) void shareOrDownload(wavFloat32(Float32Array.from(analysis!.ir, (v) => v / analysis!.peak * 0.9), data.fs), 'impulse-response.wav');
  };

  const a = analysis?.wide;
  return (
    <ModuleScreen
      title="Impulse / RT60"
      showCalBadge={false}
      chips={
        <Segmented
          label="View"
          options={[{ value: 'etc', label: 'ETC' }, { value: 'ir', label: 'IR' }, { value: 'decay', label: 'Decay' }, { value: 'metrics', label: 'Metrics' }] as const}
          value={s.view}
          onChange={(view) => patch({ view })}
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
                Plays a {s.sweepS} s sweep through the speaker and records the room's response. Place the source where you want to measure from, keep the room quiet, and
                turn the volume up enough that the sweep is clearly louder than the background.
              </p>
              <button className="btn primary" onClick={measure}>Measure</button>
            </div>
          ) : data && a ? (
            <>
              <div className="analyzer-readouts">
                <Readout size="sm" label="T30" value={fmtS(a.t30)} unit="s" tone="live" />
                <Readout size="sm" label="T20" value={fmtS(a.t20)} unit="s" />
                <Readout size="sm" label="EDT" value={fmtS(a.edt)} unit="s" />
                <Readout size="sm" label="C80" value={fmtDb1(a.c80)} unit="dB" />
                <Readout size="sm" label="Arrival" value={(analysis!.arrival.seconds * 1000).toFixed(2)} unit="ms" tone="dim" />
                <Readout size="sm" label="S/N" value={fmtDb1(a.snr)} unit="dB" tone={a.snr < 35 ? 'warn' : 'dim'} />
              </div>
              {s.view === 'decay' && (
                <div className="band-chips">
                  <Segmented
                    label="Band"
                    options={[{ value: 0, label: 'Wide' }, ...analysis!.bands.map((b, i) => ({ value: i + 1, label: formatHz(b.center) }))]}
                    value={s.band}
                    onChange={(band) => patch({ band })}
                  />
                </div>
              )}
              {s.view === 'metrics' ? (
                <div className="metrics num">
                  <table>
                    <thead>
                      <tr>
                        <th />
                        <th>Wide</th>
                        {analysis!.bands.map((b) => (
                          <th key={b.center}>{formatHz(b.center)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {METRIC_ROWS.map((r) => (
                        <tr key={r.key}>
                          <td>
                            {r.label} <small>{r.unit}</small>
                          </td>
                          <td className="wide">{r.fmt(a[r.key] as number)}</td>
                          {analysis!.bands.map((b) => (
                            <td key={b.center}>{r.fmt(b.a[r.key] as number)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="field-hint">“–” means the decay didn't have enough range above the noise floor for that metric (T30 needs about 45 dB). Measure louder or use more averages.</p>
                </div>
              ) : (
                <GraphCanvas draw={draw} canvasRef={canvasRef} />
              )}
            </>
          ) : null}
        </div>
      </MicGate>
      <MeasurementSheet open={saveOpen} onClose={() => setSaveOpen(false)} module="impulse" title="Impulse" snapshot={snapshot} canvas={s.view === 'metrics' ? undefined : canvasRef} />
      <Sheet open={settings} title="Impulse settings" onClose={() => setSettings(false)}>
        <Field label="Sweep length" hint="Longer sweeps give more signal-to-noise.">
          <Segmented options={SWEEP_OPTIONS} value={s.sweepS} onChange={(sweepS) => patch({ sweepS })} />
        </Field>
        <Field label="Averages">
          <Segmented options={[1, 2, 4] as const} value={s.averages} onChange={(averages) => patch({ averages })} />
        </Field>
        <Field label="Sweep level (dBFS peak)">
          <Segmented options={SWEEP_LEVELS.map((l) => ({ value: l, label: String(l) }))} value={s.level} onChange={(level) => patch({ level })} />
        </Field>
        {data && (
          <Field label="Export">
            <button className="btn" onClick={exportWav}>Export IR as WAV</button>
          </Field>
        )}
      </Sheet>
    </ModuleScreen>
  );
}
