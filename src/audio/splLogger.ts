import { useSyncExternalStore } from 'react';
import { LogAggregator, type LogRow } from '../dsp/logAggregator';
import { getCalibration } from '../store/calibration';
import { load, save } from '../store/persist';
import { engine } from './engine';

export interface LoggerState {
  running: boolean;
  intervalS: number;
  rows: LogRow[];
  startedAt: number | null;
  /** Session statistics in dB SPL. */
  leq: number;
  lafmax: number;
  lcpeak: number;
  l10: number;
  l90: number;
}

const saved = load<{ rows: LogRow[]; intervalS: number; startedAt: number | null }>('logger', {
  rows: [],
  intervalS: 1,
  startedAt: null,
});

/**
 * Session-wide SPL logger. Keeps running while you switch to other instruments, as long as
 * the mic is on. Rows are kept in localStorage so a reload doesn't lose the log.
 */
class SplLogger {
  state: LoggerState = {
    running: false,
    intervalS: saved.intervalS,
    rows: saved.rows,
    startedAt: saved.startedAt,
    leq: -Infinity,
    lafmax: -Infinity,
    lcpeak: -Infinity,
    l10: -Infinity,
    l90: -Infinity,
  };
  private agg: LogAggregator | null = null;
  private off: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private lastNotify = 0;
  private lastSave = 0;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private set(p: Partial<LoggerState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  private persist(force = false) {
    const now = Date.now();
    if (!force && now - this.lastSave < 10_000) return;
    this.lastSave = now;
    save('logger', { rows: this.state.rows, intervalS: this.state.intervalS, startedAt: this.state.startedAt });
  }

  setInterval(intervalS: number) {
    if (this.state.running) return;
    this.set({ intervalS });
    this.persist(true);
  }

  start() {
    if (this.state.running) return;
    const fs = engine.status.sampleRate ?? 48000;
    this.agg = new LogAggregator(this.state.intervalS, fs);
    const startedAt = this.state.rows.length ? this.state.startedAt : Date.now();
    this.set({ running: true, startedAt });
    this.off = engine.on('spl', ({ report }) => {
      const agg = this.agg!;
      const off = getCalibration().offsetDb;
      const now = Date.now();
      const row = agg.add(report, off, now);
      const stats = () => ({
        leq: agg.leqDbfs + off,
        lafmax: 10 * Math.log10(Math.max(2 * agg.sessionLafMaxMs, 1e-15)) + off,
        lcpeak: 20 * Math.log10(agg.sessionPeakC || 1e-9) + off,
        l10: agg.percentile(10) + off,
        l90: agg.percentile(90) + off,
      });
      if (row) {
        this.set({ rows: [...this.state.rows, row], ...stats() });
        this.persist();
      } else if (now - this.lastNotify > 500) {
        this.lastNotify = now;
        this.set(stats());
      }
    });
  }

  stop() {
    this.off?.();
    this.off = null;
    this.set({ running: false });
    this.persist(true);
  }

  clear() {
    this.stop();
    this.set({ rows: [], startedAt: null, leq: -Infinity, lafmax: -Infinity, lcpeak: -Infinity, l10: -Infinity, l90: -Infinity });
    this.persist(true);
  }
}

export const splLogger = new SplLogger();

export function useLogger(): LoggerState {
  return useSyncExternalStore(splLogger.subscribe, () => splLogger.state);
}
