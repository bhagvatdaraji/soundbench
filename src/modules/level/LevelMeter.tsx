import { useEffect, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { MicGate } from '../../components/MicGate';
import { ModuleScreen } from '../../components/ModuleScreen';
import { fmtDb, Readout, Segmented, ToolButton } from '../../components/ui';
import { msToDbfs } from '../../dsp/levels';
import { getCalibration } from '../../store/calibration';
import { usePersistentState } from '../../store/persist';
import { GeneratorToolButton } from '../generator/GeneratorToolButton';

const FLOOR = -60; // bottom of the bars, dBFS
const HOLD_MS = 1500;
const CLIP = -0.1; // dBFS sample peak counted as a clip

interface Levels {
  peak: number;
  rms: number;
  vu: number;
  peakHold: number;
  maxPeak: number;
  clips: number;
}

/** dBFS → 0…100 % of the bar. */
const pct = (db: number) => Math.max(0, Math.min(100, ((db - FLOOR) / -FLOOR) * 100));

function Bar({ label, value, hold, tone }: { label: string; value: number; hold?: number; tone?: string }) {
  return (
    <div className="lm-bar" aria-label={`${label} ${fmtDb(value)} dBFS`}>
      <div className="lm-bar-label">{label}</div>
      <div className="lm-track">
        <div className={`lm-fill ${tone === 'vu' ? 'vu' : value >= -1 ? 'over' : value >= -6 ? 'hot' : ''}`} style={{ width: `${pct(value)}%` }} />
        {hold != null && Number.isFinite(hold) && <div className="lm-hold" style={{ left: `${pct(hold)}%` }} />}
      </div>
      <div className="lm-bar-value num">{fmtDb(value)}</div>
    </div>
  );
}

export function LevelMeter() {
  const [s, , patch] = usePersistentState('level', { rmsWindow: 300 as 50 | 300 | 1000 });
  const [lv, setLv] = useState<Levels>({ peak: -Infinity, rms: -Infinity, vu: -Infinity, peakHold: -Infinity, maxPeak: -Infinity, clips: 0 });
  const st = useRef({ vuMs: 0, rmsMs: 0, peakHold: -Infinity, holdAt: 0, maxPeak: -Infinity, clips: 0, lastUi: 0, blockPeak: 0, blockMs: 0, blockN: 0 });
  const sRef = useRef(s);
  sRef.current = s;

  useEffect(() => {
    const release = engine.useCapture();
    const off = engine.on('capture', ({ samples }) => {
      const x = st.current;
      const fs = engine.status.sampleRate ?? 48000;
      // RMS with a selectable exponential window; VU uses 300 ms integration (IEC 60268-17 approx.)
      const aR = 1 - Math.exp(-1 / (fs * (sRef.current.rmsWindow / 1000)));
      const aV = 1 - Math.exp(-1 / (fs * 0.3 / 2.2));
      let pk = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i];
        const p = v * v;
        x.rmsMs += aR * (p - x.rmsMs);
        x.vuMs += aV * (p - x.vuMs);
        const a = v < 0 ? -v : v;
        if (a > pk) pk = a;
      }
      x.blockPeak = Math.max(x.blockPeak, pk);
      const pkDb = 20 * Math.log10(pk || 1e-9);
      const now = performance.now();
      if (pkDb >= CLIP) x.clips++;
      if (pkDb > x.peakHold || now - x.holdAt > HOLD_MS) {
        x.peakHold = pkDb;
        x.holdAt = now;
      }
      x.maxPeak = Math.max(x.maxPeak, pkDb);
      if (now - x.lastUi > 33) {
        x.lastUi = now;
        // Peak readout is sample peak in dBFS (full-scale sine peak = 0 dBFS).
        setLv({
          peak: 20 * Math.log10(x.blockPeak || 1e-9),
          rms: msToDbfs(x.rmsMs),
          vu: msToDbfs(x.vuMs),
          peakHold: x.peakHold,
          maxPeak: x.maxPeak,
          clips: x.clips,
        });
        x.blockPeak = 0;
      }
    });
    return () => {
      release();
      off();
    };
  }, []);

  const reset = () => {
    const x = st.current;
    x.maxPeak = -Infinity;
    x.clips = 0;
    x.peakHold = -Infinity;
  };
  const crest = Number.isFinite(lv.peak) && Number.isFinite(lv.rms) ? lv.peak - (lv.rms - 3.01) : NaN;
  const spl = Number.isFinite(lv.rms) ? lv.rms + getCalibration().offsetDb : -Infinity;

  return (
    <ModuleScreen
      title="Level Meter"
      chips={
        <Segmented
          label="RMS window"
          options={[{ value: 50, label: 'RMS 50 ms' }, { value: 300, label: '300 ms' }, { value: 1000, label: '1 s' }] as const}
          value={s.rmsWindow}
          onChange={(rmsWindow) => patch({ rmsWindow })}
        />
      }
      tools={
        <>
          <ToolButton icon="reset" label="Reset" onClick={reset} />
          <GeneratorToolButton />
        </>
      }
    >
      <MicGate>
        <div className="lm">
          <div className={lv.clips ? 'lm-clip on' : 'lm-clip'} role="status">
            {lv.clips ? `CLIP ×${lv.clips}` : 'No clipping'}
          </div>
          <Bar label="Peak" value={lv.peak} hold={lv.peakHold} />
          <Bar label="RMS" value={lv.rms} />
          <Bar label="VU" value={lv.vu} tone="vu" />
          <div className="lm-scale num" aria-hidden="true">
            {[-60, -50, -40, -30, -20, -10, 0].map((d) => (
              <span key={d} style={{ left: `${pct(d)}%` }}>{d}</span>
            ))}
          </div>
          <div className="lm-readouts">
            <Readout label="RMS" value={fmtDb(lv.rms)} unit="dBFS" tone="live" />
            <Readout label="Max peak" value={fmtDb(lv.maxPeak)} unit="dBFS" tone="max" />
            <Readout label="Crest" value={Number.isFinite(crest) ? crest.toFixed(1) : '–'} unit="dB" />
            <Readout label="Level" value={fmtDb(spl)} unit="dB SPL" tone="dim" />
          </div>
          <p className="module-note">dBFS: a full-scale sine reads 0 on RMS and Peak. Crest factor is peak-to-RMS (3 dB for a sine).</p>
        </div>
      </MicGate>
    </ModuleScreen>
  );
}
