import { useEffect, useRef, useState } from 'react';
import { arrivalTime, measureImpulse } from '../../audio/impulse';
import { engine } from '../../audio/engine';
import { readLatest, useCaptureRing } from '../../audio/useCaptureRing';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Progress } from '../../components/Progress';
import { Field, Segmented, Sheet, ToolButton } from '../../components/ui';
import { polarityFromIr, polarityFromPulses, type PolarityResult } from '../../dsp/polarity';
import { usePersistentState } from '../../store/persist';

const LISTEN_S = 1;

export function Polarity() {
  const [s, , patch] = usePersistentState('polarity', { mode: 'test' as 'test' | 'listen', invertMic: false });
  const [result, setResult] = useState<PolarityResult | null>(null);
  const [busy, setBusy] = useState({ on: false, progress: 0, label: '', error: '' });
  const [settings, setSettings] = useState(false);
  const ring = useCaptureRing(96000 * 2);
  const frame = useRef<Float32Array | null>(null);
  const sRef = useRef(s);
  sRef.current = s;

  const flip = (r: PolarityResult): PolarityResult =>
    sRef.current.invertMic && r.verdict !== '?' ? { ...r, verdict: r.verdict === '+' ? '−' : '+' } : r;

  const test = async () => {
    setBusy({ on: true, progress: 0, label: 'Get ready…', error: '' });
    setResult(null);
    try {
      const d = await measureImpulse({ sweepS: 1, level: -12, averages: 1, irS: 0.5, onProgress: (progress, label) => setBusy((b) => ({ ...b, progress, label })) });
      setResult(flip(polarityFromIr(d.ir, d.fs, arrivalTime(d).index)));
      setBusy({ on: false, progress: 1, label: '', error: '' });
    } catch (e) {
      setBusy({ on: false, progress: 0, label: '', error: (e as Error).message });
    }
  };

  // Listen mode: analyse the last second of mic input twice a second.
  useEffect(() => {
    if (s.mode !== 'listen') return;
    const id = setInterval(listenTick, 500);
    return () => clearInterval(id);
  }, [s.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const listenTick = () => {
    const fs = engine.status.sampleRate ?? 48000;
    const n = Math.round(LISTEN_S * fs);
    if (!frame.current || frame.current.length !== n) frame.current = new Float32Array(n);
    if (!readLatest(ring.current, frame.current)) return;
    const r = polarityFromPulses(frame.current, fs);
    setResult(r.pulses ? flip(r) : { verdict: '?', confidence: 0 });
  };

  const v = result?.verdict;
  const label = !result
    ? s.mode === 'test'
      ? 'Tap Test'
      : 'Listening…'
    : v === '+'
      ? 'Normal polarity'
      : v === '−'
        ? 'Reversed polarity'
        : s.mode === 'listen'
          ? 'No clear pulses'
          : 'Unclear: try again louder';

  return (
    <ModuleScreen
      title="Polarity"
      showCalBadge={false}
      chips={
        <Segmented
          label="Mode"
          options={[{ value: 'test', label: 'Test with this phone' }, { value: 'listen', label: 'Listen' }] as const}
          value={s.mode}
          onChange={(mode) => {
            setResult(null);
            patch({ mode });
          }}
        />
      }
      tools={
        <>
          {s.mode === 'test' && <ToolButton icon="play" label={busy.on ? 'Testing' : 'Test'} onClick={() => void test()} disabled={busy.on} active={busy.on} />}
          <ToolButton icon="settings" label="Settings" onClick={() => setSettings(true)} />
        </>
      }
    >
      <MicGate>
        <div className="polarity">
          {busy.on && <Progress value={busy.progress} label={busy.label} />}
          {busy.error && <p className="measure-error">{busy.error}</p>}
          <div className={`pol-badge ${v === '+' ? 'pos' : v === '−' ? 'neg' : 'unk'}`} role="status" aria-label={label} data-verdict={v ?? ''}>
            {v ?? '·'}
          </div>
          <div className="pol-label">{label}</div>
          {result && result.verdict !== '?' && <div className="pol-conf num">confidence {Math.round(result.confidence * 100)} %</div>}
          <p className="pol-help">
            {s.mode === 'test'
              ? 'Plays a short sweep through this phone’s output and checks which way the speaker pushes first. Connect the phone (cable or interface) to the system under test and put the mic near the speaker.'
              : 'On another device, open SoundBench › Generator › Polarity and play it into the system. Hold this phone near each speaker in turn. All speakers should show the same sign.'}
          </p>
        </div>
      </MicGate>
      <Sheet open={settings} title="Polarity settings" onClose={() => setSettings(false)}>
        <Field
          label="Invert microphone"
          hint="Phone and USB mics are not guaranteed to be in positive polarity. Check once with a speaker you know is wired correctly; if it shows −, turn this on."
        >
          <Segmented options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] as const} value={s.invertMic ? 'on' : 'off'} onChange={(x) => patch({ invertMic: x === 'on' })} />
        </Field>
      </Sheet>
    </ModuleScreen>
  );
}
