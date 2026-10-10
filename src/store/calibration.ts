import { useSyncExternalStore } from 'react';
import { load, save } from './persist';

export interface Calibration {
  /** dB added to dBFS to get dB SPL. */
  offsetDb: number;
  /** Set once the user has calibrated against a reference. */
  calibratedAt: string | null;
  /** Measured speaker→mic system latency (ms), subtracted from arrival times. */
  latencyMs: number | null;
}

/**
 * Starting guess for an iPhone's built-in mic with Safari's voice processing turned off:
 * roughly 0 dBFS ≈ 120 dB SPL. Readings are shown as "uncalibrated" until the user sets it.
 */
export const DEFAULT_OFFSET_DB = 120;
const BLANK: Calibration = { offsetDb: DEFAULT_OFFSET_DB, calibratedAt: null, latencyMs: null };

/**
 * Calibration is kept per microphone (keyed by its name), because every mic and interface
 * has a different sensitivity. Before v1.1 there was a single calibration; it is handed to
 * the first microphone that gets used.
 */
interface Store {
  byMic: Record<string, Calibration>;
  active: string;
  legacy: Calibration | null;
}

const legacy = load<Calibration | null>('calibration', null);
const store: Store = load<Store>('calibrations', { byMic: {}, active: '', legacy: null });
if (legacy && !Object.keys(store.byMic).length && !store.legacy) store.legacy = { ...BLANK, ...legacy };

let current: Calibration = store.byMic[store.active] ?? BLANK;
const listeners = new Set<() => void>();

function commit() {
  current = store.byMic[store.active] ?? BLANK;
  save('calibrations', store);
  listeners.forEach((l) => l());
}

export function getCalibration(): Calibration {
  return current;
}

export function setCalibration(c: Calibration): void {
  store.byMic[store.active] = c;
  commit();
}

/** Called by the engine when a microphone starts; switches to that mic's calibration. */
export function setActiveMic(key: string): void {
  if (store.legacy && !store.byMic[key]) {
    store.byMic[key] = store.legacy;
    store.legacy = null;
  }
  store.active = key;
  commit();
}

export function activeMic(): string {
  return store.active;
}

export function useCalibration(): Calibration {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
