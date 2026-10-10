import { useEffect, useState } from 'react';
import { AnalogDial } from '../../components/AnalogDial';
import { MeasurementSheet, type Snapshot } from '../../components/MeasurementSheet';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, fmtDb, Readout, Segmented, Sheet, ToolButton } from '../../components/ui';
import { GeneratorToolButton } from '../generator/GeneratorToolButton';
import type { TimeWeighting } from '../../dsp/levels';
import type { Weighting } from '../../dsp/weighting';
import { usePersistentState } from '../../store/persist';
import { fmtElapsed, useSpl } from './useSpl';

const TIME_LABEL: Record<TimeWeighting, string> = { F: 'FAST', S: 'SLOW', I: 'IMPULSE' };
const RANGES = ['auto', 20, 40, 60, 80] as const;
type Range = (typeof RANGES)[number];

export function SplMeter() {
  const [s, , patch] = usePersistentState('spl', {
    weighting: 'A' as Weighting,
    time: 'F' as TimeWeighting,
    range: 'auto' as Range,
  });
  const [autoMin, setAutoMin] = useState(30);
  const [settings, setSettings] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const { stats, reset } = useSpl();
  const key = `${s.weighting}${s.time}` as const;
  const level = stats.now[key];

  // Auto range: 60 dB window in 20 dB steps, with hysteresis.
  useEffect(() => {
    if (s.range !== 'auto' || !Number.isFinite(level)) return;
    if (level > autoMin + 57) setAutoMin(Math.min(100, Math.ceil((level - 50) / 20) * 20));
    else if (level < autoMin + 3 && autoMin > 0) setAutoMin(Math.max(0, Math.floor((level - 10) / 20) * 20));
  }, [level, s.range, autoMin]);
  const min = s.range === 'auto' ? autoMin : s.range;
  const max = min + 60;
  const snapshot = (): Snapshot | null => {
    if (!stats.elapsed) return null;
    const rows: (string | number)[][] = [];
    for (const w of ['A', 'C', 'Z'] as const) {
      rows.push([`L${w}eq`, +stats.leq[w].toFixed(1)], [`L${w}peak`, +stats.peak[w].toFixed(1)]);
      for (const t of ['F', 'S', 'I'] as const) {
        const k = `${w}${t}` as const;
        rows.push([`L${w}${t}max`, +stats.max[k].toFixed(1)], [`L${w}${t}min`, +stats.min[k].toFixed(1)]);
      }
    }
    rows.push(['duration_s', +stats.elapsed.toFixed(1)]);
    return {
      data: { kind: 'table', columns: ['metric', 'dB'], rows },
      settings: { weighting: s.weighting, time: s.time },
      lines: [],
    };
  };
  const unit = s.weighting === 'Z' ? 'dB(Z)' : `dB(${s.weighting})`;

  return (
    <ModuleScreen
      title="SPL Meter"
      chips={
        <>
          <Segmented label="Frequency weighting" options={['A', 'C', 'Z'] as const} value={s.weighting} onChange={(weighting) => patch({ weighting })} />
          <Segmented
            label="Time weighting"
            options={[{ value: 'F', label: 'Fast' }, { value: 'S', label: 'Slow' }, { value: 'I', label: 'Imp' }] as const}
            value={s.time}
            onChange={(time) => patch({ time })}
          />
        </>
      }
      tools={
        <>
          <ToolButton icon="reset" label="Reset" onClick={reset} />
          <ToolButton icon="folder" label="Save" onClick={() => setSaveOpen(true)} />
          <GeneratorToolButton />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="spl">
          <div className="spl-dial">
            <AnalogDial value={level} min={min} max={max} caption={unit} subcaption={TIME_LABEL[s.time]} />
          </div>
          <div className="spl-side">
            <div className="spl-big">
              <span className="spl-big-value num">{fmtDb(level)}</span>
              <span className="spl-big-unit">{unit}</span>
            </div>
            <div className="spl-grid">
              <Readout label={`L${s.weighting}eq`} value={fmtDb(stats.leq[s.weighting])} tone="live" />
              <Readout label="Max" value={fmtDb(stats.max[key])} tone="max" />
              <Readout label="Min" value={fmtDb(stats.min[key])} />
              <Readout label={`L${s.weighting}peak`} value={fmtDb(stats.peak[s.weighting])} tone="warn" />
              <Readout label="Elapsed" value={fmtElapsed(stats.elapsed)} tone="dim" />
              <Readout label="Range" value={`${min}–${max}`} tone="dim" />
            </div>
          </div>
        </div>
      </MicGate>
      <MeasurementSheet open={saveOpen} onClose={() => setSaveOpen(false)} module="spl" title="SPL" snapshot={snapshot} />
      <Sheet open={settings} title="SPL Meter settings" onClose={() => setSettings(false)}>
        <Field label="Meter range" hint="Auto picks a 60 dB window around the current level.">
          <Segmented
            options={RANGES.map((r) => ({ value: r, label: r === 'auto' ? 'Auto' : `${r}–${r + 60}` }))}
            value={s.range}
            onChange={(range) => patch({ range })}
          />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
