import { useState } from 'react';
import { useEngineStatus } from '../../audio/engine';
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
  const nudge = (d: number) => setCalibration({ offsetDb: +(cal.offsetDb + d).toFixed(1), calibratedAt: new Date().toISOString() });

  const apply = () => {
    const r = Number(ref);
    if (!Number.isFinite(r) || !Number.isFinite(dbfs)) return;
    setCalibration({ offsetDb: +(r - dbfs).toFixed(2), calibratedAt: new Date().toISOString() });
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
              <button className="btn primary" onClick={apply} disabled={!Number.isFinite(dbfs)}>
                Set
              </button>
            </div>
          </Field>

          <Field label={`Offset  ${cal.offsetDb.toFixed(1)} dB`} hint={cal.calibratedAt ? `Calibrated ${new Date(cal.calibratedAt).toLocaleString()}` : 'Not calibrated yet. Using a rough default for iPhone mics.'}>
            <div className="cal-row">
              <button className="btn" onClick={() => nudge(-1)}>−1</button>
              <button className="btn" onClick={() => nudge(-0.1)}>−0.1</button>
              <button className="btn" onClick={() => nudge(0.1)}>+0.1</button>
              <button className="btn" onClick={() => nudge(1)}>+1</button>
              <button className="btn ghost" onClick={() => setCalibration({ offsetDb: DEFAULT_OFFSET_DB, calibratedAt: null })}>
                Reset
              </button>
            </div>
          </Field>

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
