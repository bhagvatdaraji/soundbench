import { useEffect, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, fmtDb, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { msToDbfs } from '../../dsp/levels';
import { RollingLeq } from '../../dsp/rollingLeq';
import { getCalibration } from '../../store/calibration';
import { usePersistentState } from '../../store/persist';
import { fmtElapsed } from '../spl/useSpl';

type Metric = 'LAF' | 'LAeq1' | 'LAeq5' | 'LAeq15';
const METRICS: { value: Metric; label: string; window: number }[] = [
  { value: 'LAF', label: 'LAF', window: 0 },
  { value: 'LAeq1', label: 'Leq 1m', window: 60 },
  { value: 'LAeq5', label: 'Leq 5m', window: 300 },
  { value: 'LAeq15', label: 'Leq 15m', window: 900 },
];
type Light = 'green' | 'amber' | 'red';

export function TrafficLight() {
  const [s, , patch] = usePersistentState('traffic', { metric: 'LAeq1' as Metric, limit: 85, margin: 3 });
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState({ level: -Infinity, overS: 0, sessionLeq: -Infinity, elapsed: 0, fill: 0 });
  const acc = useRef({ rolling: new RollingLeq(48000 * 60), energy: 0, samples: 0, overSamples: 0, fs: 0 });
  const sRef = useRef(s);
  sRef.current = s;

  const reset = () => {
    const fs = engine.status.sampleRate ?? 48000;
    const win = METRICS.find((m) => m.value === sRef.current.metric)!.window || 1;
    acc.current = { rolling: new RollingLeq(fs * win), energy: 0, samples: 0, overSamples: 0, fs };
  };

  useEffect(reset, [s.metric]);

  useEffect(
    () =>
      engine.on('spl', ({ report }) => {
        // the window was sized before the mic (and its sample rate) existed: resize once
        if (acc.current.fs !== (engine.status.sampleRate ?? 48000)) reset();
        const a = acc.current;
        const st = sRef.current;
        const ch = report.channels.A;
        const off = getCalibration().offsetDb;
        a.rolling.add(ch.energy, report.samples);
        a.energy += ch.energy;
        a.samples += report.samples;
        const level = (st.metric === 'LAF' ? msToDbfs(ch.now.F) : msToDbfs(a.rolling.meanSquare)) + off;
        if (level >= st.limit) a.overSamples += report.samples;
        const fs = engine.status.sampleRate ?? 48000;
        setView({
          level,
          overS: a.overSamples / fs,
          sessionLeq: msToDbfs(a.energy / Math.max(1, a.samples)) + off,
          elapsed: a.samples / fs,
          fill: st.metric === 'LAF' ? 1 : a.rolling.fill,
        });
      }),
    [],
  );

  const light: Light = !Number.isFinite(view.level) ? 'green' : view.level >= s.limit ? 'red' : view.level >= s.limit - s.margin ? 'amber' : 'green';
  const metricLabel = METRICS.find((m) => m.value === s.metric)!.label;

  return (
    <ModuleScreen
      title="Traffic Light"
      chips={<Segmented label="Metric" options={METRICS.map(({ value, label }) => ({ value, label }))} value={s.metric} onChange={(metric) => patch({ metric })} />}
      tools={
        <>
          <ToolButton icon="reset" label="Reset" onClick={reset} />
          <ToolButton icon="settings" label="Limit" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className={`traffic traffic-${light}`} data-light={light}>
          <div className="traffic-lamps" aria-hidden="true">
            <span className={light === 'red' ? 'lamp red on' : 'lamp red'} />
            <span className={light === 'amber' ? 'lamp amber on' : 'lamp amber'} />
            <span className={light === 'green' ? 'lamp green on' : 'lamp green'} />
          </div>
          <div className="traffic-main">
            <div className="traffic-value num" role="status" aria-label={`${metricLabel} ${fmtDb(view.level)} dB, ${light}`}>
              {fmtDb(view.level)}
            </div>
            <div className="traffic-unit">
              dB {metricLabel}
              {view.fill < 1 && <span className="traffic-fill"> · window {Math.round(view.fill * 100)}%</span>}
            </div>
            <div className="traffic-limit">
              <button className="btn" onClick={() => patch({ limit: s.limit - 1 })} aria-label="Lower limit">−</button>
              <span className="num">Limit {s.limit} dB</span>
              <button className="btn" onClick={() => patch({ limit: s.limit + 1 })} aria-label="Raise limit">+</button>
            </div>
            <div className="traffic-stats">
              <Readout size="sm" label="Over limit" value={fmtElapsed(view.overS)} tone={view.overS > 0 ? 'max' : 'dim'} />
              <Readout size="sm" label="LAeq total" value={fmtDb(view.sessionLeq)} />
              <Readout size="sm" label="Elapsed" value={fmtElapsed(view.elapsed)} tone="dim" />
            </div>
          </div>
        </div>
      </MicGate>
      <Sheet open={settings} title="Traffic Light settings" onClose={() => setSettings(false)}>
        <Field label="Limit (dB)">
          <Segmented options={[70, 80, 85, 90, 95, 98, 100, 102]} value={s.limit} onChange={(limit) => patch({ limit })} />
        </Field>
        <Field label="Amber warning starts" hint="How far below the limit the light turns amber.">
          <Segmented options={[{ value: 1, label: '1 dB' }, { value: 3, label: '3 dB' }, { value: 6, label: '6 dB' }]} value={s.margin} onChange={(margin) => patch({ margin })} />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
