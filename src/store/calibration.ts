import { useSyncExternalStore } from 'react';
import { load, save } from './persist';

export interface Calibration {
  /** dB added to dBFS to get dB SPL. */
  offsetDb: number;
  /** Set once the user has calibrated against a reference. */
  calibratedAt: string | null;
}

/**
 * Starting guess for an iPhone's built-in mic with Safari's voice processing turned off:
 * roughly 0 dBFS ≈ 120 dB SPL. Readings are shown as "uncalibrated" until the user sets it.
 */
export const DEFAULT_OFFSET_DB = 120;

let current: Calibration = load('calibration', { offsetDb: DEFAULT_OFFSET_DB, calibratedAt: null });
const listeners = new Set<() => void>();

export function getCalibration(): Calibration {
  return current;
}

export function setCalibration(c: Calibration): void {
  current = c;
  save('calibration', c);
  listeners.forEach((l) => l());
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
