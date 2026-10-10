import { useSyncExternalStore } from 'react';
import { deconvolve } from '../dsp/deconvolve';
import { expSweep } from '../dsp/sweep';
import { getCalibration } from '../store/calibration';
import { engine } from './engine';
import { playAndRecord } from './measure';

export interface ImpulseData {
  ir: Float32Array;
  fs: number;
  /** Index in `ir` that corresponds to the moment playback started. */
  zero: number;
  /** Device latency (s) assumed for this measurement, already part of `zero`'s offset. */
  latencyS: number;
  sweepS: number;
  createdAt: string;
}

let last: ImpulseData | null = null;
const listeners = new Set<() => void>();

/** The most recent impulse measurement (shared by Impulse/RT60, LARSA and Polarity). */
export function useLastImpulse(): ImpulseData | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => last,
  );
}

/**
 * Speaker → mic latency of this device. Loopback mode has none; otherwise the calibrated value,
 * or the browser's own estimate.
 */
export function systemLatencyS(): number {
  if (engine.loopback) return 0;
  const cal = getCalibration().latencyMs;
  if (cal != null) return cal / 1000;
  const ctx = engine.audio?.ctx as (AudioContext & { outputLatency?: number }) | undefined;
  return (ctx?.outputLatency ?? 0) + (ctx?.baseLatency ?? 0);
}

export interface ImpulseOptions {
  sweepS: number;
  /** Sweep peak level, dBFS. */
  level: number;
  averages: number;
  irS?: number;
  onProgress?: (f: number, label: string) => void;
}

/** Plays log sweeps, averages the recordings and deconvolves them into an impulse response. */
export async function measureImpulse({ sweepS, level, averages, irS = 3, onProgress }: ImpulseOptions): Promise<ImpulseData> {
  const fs = engine.audio?.ctx.sampleRate ?? engine.status.sampleRate ?? 48000;
  const sweep = expSweep(fs, 20, Math.min(20000, fs * 0.45), sweepS, 10 ** (level / 20));
  let sum: Float32Array | null = null;
  let pre = 0;
  for (let a = 0; a < averages; a++) {
    const rec = await playAndRecord(sweep, {
      tailS: Math.min(irS, 2),
      preS: 0.05,
      onProgress: (f) => onProgress?.((a + f) / averages, averages > 1 ? `Sweep ${a + 1} of ${averages}` : 'Measuring…'),
    });
    pre = rec.pre;
    if (!sum) sum = rec.recorded.slice();
    else for (let i = 0; i < sum.length; i++) sum[i] += rec.recorded[i];
  }
  const recorded = sum!.map((v) => v / averages);
  onProgress?.(1, 'Calculating…');
  await new Promise((r) => setTimeout(r, 0));
  const irFull = deconvolve(recorded, sweep, fs, { f1: 20, f2: Math.min(20000, fs * 0.45), length: Math.round((irS + 0.05) * fs) + pre });
  const data: ImpulseData = {
    ir: Float32Array.from(irFull),
    fs,
    zero: pre,
    latencyS: systemLatencyS(),
    sweepS,
    createdAt: new Date().toISOString(),
  };
  last = data;
  listeners.forEach((l) => l());
  return data;
}

/** Arrival time (s) of the strongest peak after playback start, minus device latency. */
export function arrivalTime(d: ImpulseData): { index: number; seconds: number } {
  let k = d.zero;
  for (let i = d.zero; i < d.ir.length; i++) if (Math.abs(d.ir[i]) > Math.abs(d.ir[k])) k = i;
  return { index: k, seconds: (k - d.zero) / d.fs - d.latencyS };
}

