import { useEffect, useRef, useState } from 'react';
import { engine, useEngineStatus } from '../../audio/engine';
import { arrivalTime, measureImpulse, systemLatencyS } from '../../audio/impulse';
import { Progress } from '../../components/Progress';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { Field, fmtDb, Readout } from '../../components/ui';
import { DEFAULT_OFFSET_DB, setCalibration, useCalibration } from '../../store/calibration';
import { useSpl } from '../spl/useSpl';

export function Calibration() {
  const cal = useCalibration();
  const status = useEngineStatus();
  const { stats } = useSpl();
  const [ref, setRef] = useState('94.0');
  // Slow, Z-weighted: right for a 1 kHz calibrator, and steady enough to read.
  const spl = stats.now.ZS;
  const dbfs = Number.isFinite(spl) ? spl - cal.offsetDb : -Infinity;
  const stable = useStable(dbfs);
  const nudge = (d: number) => setCalibration({ ...cal, offsetDb: +(cal.offsetDb + d).toFixed(1), calibratedAt: new Date().toISOString() });

  const apply = () => {
    const r = Number(ref);
    if (!Number.isFinite(r) || !Number.isFinite(dbfs) || !stable) return;
    setCalibration({ ...cal, offsetDb: +(r - dbfs).toFixed(2), calibratedAt: new Date().toISOString() });
  };

  const ts = status.trackSettings as (MediaTrackSettings & Record<string, unknown>) | null;
  const flag = (v: unknown) => (v === undefined ? 'not reported' : v ? 'ON ⚠︎' : 'off');

  return (
    <ModuleScreen title="Calibration" showCalBadge={false}>
      <MicGate>
        <div className="cal">
          <div className="cal-live">
            <Readout label="Input (Z, Slow)" value={fmtDb(dbfs)} unit="dBFS" />
            <Readout label="Reads as" value={fmtDb(spl)} unit="dB SPL" tone="live" size="lg" />
          </div>

          <Field
            label="Calibrate to a known level"
            hint="Play a calibrator (94 dB at 1 kHz), or put the phone next to a trusted meter playing steady pink noise. Type the true level, then tap Set."
          >
            <div className="cal-row">
              <input className="num cal-input" inputMode="decimal" value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Reference level in dB SPL" />
              <span className="gen-unit">dB SPL</span>
              <button className="btn primary" onClick={apply} disabled={!stable}>
                {stable ? 'Set' : 'Settling…'}
              </button>
            </div>
          </Field>

          <Field label={`Offset  ${cal.offsetDb.toFixed(1)} dB`} hint={cal.calibratedAt ? `Calibrated ${new Date(cal.calibratedAt).toLocaleString()}` : 'Not calibrated yet. Using a rough default for iPhone mics.'}>
            <div className="cal-row">
              <button className="btn" onClick={() => nudge(-1)}>−1</button>
              <button className="btn" onClick={() => nudge(-0.1)}>−0.1</button>
              <button className="btn" onClick={() => nudge(0.1)}>+0.1</button>
              <button className="btn" onClick={() => nudge(1)}>+1</button>
              <button className="btn ghost" onClick={() => setCalibration({ ...cal, offsetDb: DEFAULT_OFFSET_DB, calibratedAt: null })}>
                Reset
              </button>
            </div>
          </Field>

          <LatencyField />

          <Field label="Input details" hint="If any processing shows ON, the browser is altering the mic signal and readings will be less accurate.">
            <dl className="cal-info num">
              <dt>Sample rate</dt>
              <dd>{status.sampleRate ? `${status.sampleRate} Hz` : '–'}</dd>
              <dt>Echo cancellation</dt>
              <dd>{flag(ts?.echoCancellation)}</dd>
              <dt>Noise suppression</dt>
              <dd>{flag(ts?.noiseSuppression)}</dd>
              <dt>Auto gain</dt>
              <dd>{flag(ts?.autoGainControl)}</dd>
            </dl>
          </Field>
        </div>
      </MicGate>
    </ModuleScreen>
  );
}

/** True once the reading has stayed within ±0.15 dB for the last 2 seconds. */
function useStable(db: number): boolean {
  const history = useRef<{ t: number; v: number }[]>([]);
  const [stable, setStable] = useState(false);
  useEffect(() => {
    const now = performance.now();
    const h = history.current;
    if (!Number.isFinite(db)) {
      h.length = 0;
      setStable(false);
      return;
    }
    h.push({ t: now, v: db });
    while (h.length && now - h[0].t > 2000) h.shift();
    const span = h.length ? now - h[0].t : 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of h) {
      lo = Math.min(lo, p.v);
      hi = Math.max(hi, p.v);
    }
    setStable(span > 1800 && hi - lo < 0.3);
  }, [db]);
  return stable;
}

/** Measures the speaker → mic round-trip latency with a short sweep (phone held at its own speaker). */
function LatencyField() {
  const cal = useCalibration();
  const [busy, setBusy] = useState<{ p: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const measure = async () => {
    setError('');
    setBusy({ p: 0, label: 'Get ready…' });
    try {
      const d = await measureImpulse({ sweepS: 1, level: -18, averages: 1, irS: 0.3, onProgress: (p, label) => setBusy({ p, label }) });
      // arrivalTime() subtracts the current latency; we want the raw round trip
      const raw = arrivalTime(d).seconds + d.latencyS;
      setCalibration({ ...cal, latencyMs: +(raw * 1000).toFixed(2) });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };
  const current = systemLatencyS() * 1000;
  return (
    <Field
      label={`Speaker → mic latency  ${current.toFixed(1)} ms`}
      hint={
        engine.loopback
          ? 'Loopback test mode has no device latency.'
          : cal.latencyMs != null
            ? 'Measured. Delay finder and arrival times subtract this.'
            : 'Estimated by the browser. For accurate delay and distance readings, hold the phone’s mic right at its own speaker (or loop an interface output to its input) and tap Measure.'
      }
    >
      {busy && <Progress value={busy.p} label={busy.label} />}
      <div className="cal-row">
        <button className="btn" onClick={() => void measure()} disabled={!!busy || !!engine.loopback}>
          Measure latency
        </button>
        {cal.latencyMs != null && (
          <button className="btn ghost" onClick={() => setCalibration({ ...cal, latencyMs: null })}>
            Use estimate
          </button>
        )}
      </div>
      {error && <p className="measure-error">{error}</p>}
    </Field>
  );
}
