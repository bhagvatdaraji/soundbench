import { useEffect, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { msToDbfs, TIME_WEIGHTINGS, type TimeWeighting } from '../../dsp/levels';
import { WEIGHTINGS } from '../../dsp/splCore';
import type { Weighting } from '../../dsp/weighting';
import { getCalibration } from '../../store/calibration';

type Key = `${Weighting}${TimeWeighting}`;

export interface SplStats {
  /** Current level for every weighting/time combination, dB SPL. */
  now: Record<Key, number>;
  max: Record<Key, number>;
  min: Record<Key, number>;
  /** Leq per frequency weighting since reset. */
  leq: Record<Weighting, number>;
  /** Peak per frequency weighting since reset (dB SPL of |x| max). */
  peak: Record<Weighting, number>;
  /** Seconds since reset. */
  elapsed: number;
}

const keys = WEIGHTINGS.flatMap((w) => TIME_WEIGHTINGS.map((t) => `${w}${t}` as Key));
const blank = (v: number) => Object.fromEntries(keys.map((k) => [k, v])) as Record<Key, number>;
const perW = (v: number) => ({ A: v, C: v, Z: v });

/** Aggregates the worklet's SPL reports into running Max/Min/Leq/Peak. */
export function useSpl(): { stats: SplStats; reset: () => void } {
  const acc = useRef({
    maxMs: blank(0),
    minMs: blank(Infinity),
    energy: perW(0),
    peak: perW(0),
    samples: 0,
    skip: 0,
  });
  const [stats, setStats] = useState<SplStats>({
    now: blank(-Infinity),
    max: blank(-Infinity),
    min: blank(-Infinity),
    leq: perW(-Infinity),
    peak: perW(-Infinity),
    elapsed: 0,
  });
  const fs = useRef(48000);

  useEffect(() => {
    return engine.on('spl', ({ report }) => {
      const a = acc.current;
      const off = getCalibration().offsetDb;
      const toSpl = (ms: number) => msToDbfs(ms) + off;
      fs.current = engine.status.sampleRate ?? 48000;
      const now = blank(0);
      // Ignore Max/Min for the first half second after a reset while time weighting settles.
      const settling = a.skip > 0;
      if (settling) a.skip--;
      for (const w of WEIGHTINGS) {
        const ch = report.channels[w];
        for (const t of TIME_WEIGHTINGS) {
          const k = `${w}${t}` as Key;
          now[k] = toSpl(ch.now[t]);
          if (!settling) {
            if (ch.max[t] > a.maxMs[k]) a.maxMs[k] = ch.max[t];
            if (ch.min[t] < a.minMs[k]) a.minMs[k] = ch.min[t];
          }
        }
        a.energy[w] += ch.energy;
        if (ch.peak > a.peak[w]) a.peak[w] = ch.peak;
      }
      a.samples += report.samples;
      const max = blank(0);
      const min = blank(0);
      for (const k of keys) {
        max[k] = a.maxMs[k] > 0 ? toSpl(a.maxMs[k]) : -Infinity;
        min[k] = Number.isFinite(a.minMs[k]) ? toSpl(a.minMs[k]) : -Infinity;
      }
      const n = Math.max(1, a.samples);
      setStats({
        now,
        max,
        min,
        // peak |x|: a full-scale sine peaks at 1 and reads 0 dBFS, so 20·log10(|x|)
        leq: { A: toSpl(a.energy.A / n), C: toSpl(a.energy.C / n), Z: toSpl(a.energy.Z / n) },
        peak: {
          A: 20 * Math.log10(a.peak.A || 1e-9) + off,
          C: 20 * Math.log10(a.peak.C || 1e-9) + off,
          Z: 20 * Math.log10(a.peak.Z || 1e-9) + off,
        },
        elapsed: a.samples / fs.current,
      });
    });
  }, []);

  const reset = () => {
    acc.current = { maxMs: blank(0), minMs: blank(Infinity), energy: perW(0), peak: perW(0), samples: 0, skip: 15 };
  };
  // Settle once at start too.
  useEffect(() => {
    acc.current.skip = 15;
  }, []);

  return { stats, reset };
}

export function fmtElapsed(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
