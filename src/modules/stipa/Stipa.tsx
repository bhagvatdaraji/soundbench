import { useEffect, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { MeasurementSheet, type Snapshot } from '../../components/MeasurementSheet';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Progress } from '../../components/Progress';
import { Field, Segmented, Sheet, ToolButton } from '../../components/ui';
import { formatHz } from '../../dsp/bands';
import type { GeneratorParams } from '../../dsp/generators';
import { analyzeStipa, STIPA_BANDS, stiRating, type StipaResult } from '../../dsp/stipa';
import { usePersistentState } from '../../store/persist';

const SETTLE_S = 1.5;

export function Stipa() {
  const [s, , patch] = usePersistentState('stipa', { source: 'play' as 'play' | 'external', seconds: 18 as 9 | 18, level: -12 });
  const [busy, setBusy] = useState<{ p: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [res, setRes] = useState<StipaResult | null>(null);
  const [settings, setSettings] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const prevGen = useRef<{ params: GeneratorParams; running: boolean } | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const restoreGen = () => {
    if (prevGen.current) {
      engine.setGenerator(prevGen.current.params);
      void engine.setGeneratorRunning(prevGen.current.running);
      prevGen.current = null;
    }
  };
  useEffect(() => () => {
    cancel.current?.();
    restoreGen();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const measure = async () => {
    setError('');
    setRes(null);
    const fs = engine.status.sampleRate ?? 48000;
    try {
      if (s.source === 'play') {
        prevGen.current = { params: engine.status.generator, running: engine.status.generatorRunning };
        engine.setGenerator({ waveform: 'stipa', level: s.level, channels: 'both' });
        await engine.setGeneratorRunning(true);
        setBusy({ p: 0, label: 'Starting test signal…' });
        await new Promise((r) => setTimeout(r, SETTLE_S * 1000));
      }
      const total = Math.round(s.seconds * fs);
      const rec = new Float32Array(total);
      let filled = 0;
      const release = engine.useCapture();
      await new Promise<void>((resolve, reject) => {
        const off = engine.on('capture', ({ samples }) => {
          const n = Math.min(samples.length, total - filled);
          rec.set(samples.subarray(0, n), filled);
          filled += n;
          const left = Math.ceil((total - filled) / fs);
          setBusy({ p: filled / total, label: `Measuring… ${left} s` });
          if (filled >= total) {
            off();
            resolve();
          }
        });
        cancel.current = () => {
          off();
          reject(new Error('Cancelled.'));
        };
      });
      release();
      cancel.current = null;
      restoreGen();
      setBusy({ p: 1, label: 'Calculating…' });
      await new Promise((r) => setTimeout(r, 30));
      setRes(analyzeStipa(rec, fs));
    } catch (e) {
      setError((e as Error).message);
      restoreGen();
    }
    setBusy(null);
  };

  const rating = res ? stiRating(res.sti) : null;
  const quiet = res ? res.bandDbfs.some((d) => d < -75) : false;

  const snapshot = (): Snapshot | null =>
    res && {
      data: {
        kind: 'table',
        columns: ['band', 'MTI', 'MTF_f1', 'MTF_f2', 'level_dBFS'],
        rows: [
          ...STIPA_BANDS.map((f, k) => [`${formatHz(f)} Hz`, +res.mti[k].toFixed(3), +res.mtf[k][0].toFixed(3), +res.mtf[k][1].toFixed(3), +res.bandDbfs[k].toFixed(1)]),
          ['STI', +res.sti.toFixed(3), '', '', ''],
        ],
      },
      settings: { source: s.source, seconds: s.seconds },
      lines: [`STI ${res.sti.toFixed(2)} (${rating!.band}, ${rating!.label}) · experimental`],
    };

  return (
    <ModuleScreen
      title="STIPA"
      showCalBadge={false}
      chips={
        <Segmented
          label="Signal source"
          options={[{ value: 'play', label: 'Play from this phone' }, { value: 'external', label: 'External source' }] as const}
          value={s.source}
          onChange={(source) => patch({ source })}
        />
      }
      tools={
        <>
          <ToolButton icon="play" label={busy ? 'Measuring' : 'Measure'} onClick={() => void measure()} disabled={!!busy} active={!!busy} />
          <ToolButton icon="folder" label="Save" onClick={() => setSaveOpen(true)} />
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="stipa">
          <div className="experimental">EXPERIMENTAL · not a certified STI meter</div>
          {busy && <Progress value={busy.p} label={busy.label} />}
          {error && <p className="measure-error">{error}</p>}
          {res && rating ? (
            <>
              <div className="sti-value num" role="status" aria-label={`STI ${res.sti.toFixed(2)}`}>
                {res.sti.toFixed(2)}
              </div>
              <div className="sti-rating">
                <span className="sti-band">{rating.band}</span> {rating.label}
              </div>
              {quiet && <p className="measure-error">Some bands were very quiet. Play the test signal louder for a reliable result.</p>}
              <div className="mti-bars" aria-label="Modulation transfer index per band">
                {STIPA_BANDS.map((f, k) => (
                  <div key={f} className="mti-col">
                    <div className="mti-track">
                      <div className="mti-fill" style={{ height: `${Math.round(res.mti[k] * 100)}%` }} />
                    </div>
                    <div className="mti-val num">{res.mti[k].toFixed(2)}</div>
                    <div className="mti-f">{formatHz(f)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            !busy && (
              <p className="pol-help">
                {s.source === 'play'
                  ? `Plays the STIPA test signal through this phone's output (connect it to the sound system) and measures for ${s.seconds} s. Stand where listeners would be, or leave the phone there.`
                  : `Play the STIPA signal into the system from another device (SoundBench › Generator › STIPA), place this phone at a listener position and tap Measure (${s.seconds} s).`}
              </p>
            )
          )}
          <p className="field-hint">
            Simplified IEC 60268-16: no auditory masking, hearing threshold or ambient-noise corrections, and phone mics aren't calibrated for STI. Use it to compare
            positions and changes, not for compliance.
          </p>
        </div>
      </MicGate>
      <MeasurementSheet open={saveOpen} onClose={() => setSaveOpen(false)} module="stipa" title="STIPA" snapshot={snapshot} />
      <Sheet open={settings} title="STIPA settings" onClose={() => setSettings(false)}>
        <Field label="Duration" hint="The standard asks for 15–25 s. Quick is less repeatable.">
          <Segmented options={[{ value: 18, label: '18 s' }, { value: 9, label: '9 s (quick)' }] as const} value={s.seconds} onChange={(seconds) => patch({ seconds })} />
        </Field>
        <Field label="Signal level (dBFS)">
          <Segmented options={[-24, -18, -12, -6].map((v) => ({ value: v, label: String(v) }))} value={s.level} onChange={(level) => patch({ level })} />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
