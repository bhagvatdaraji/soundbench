import { useState } from 'react';
import { measureImpulse, type ImpulseOptions } from '../../audio/impulse';

/** Runs an impulse measurement and tracks its progress for the UI. */
export function useImpulseRunner() {
  const [state, setState] = useState({ measuring: false, progress: 0, label: '', error: '' });
  const run = async (opts: Omit<ImpulseOptions, 'onProgress'>) => {
    setState({ measuring: true, progress: 0, label: 'Get ready…', error: '' });
    try {
      await measureImpulse({ ...opts, onProgress: (progress, label) => setState((s) => ({ ...s, progress, label })) });
      setState({ measuring: false, progress: 1, label: '', error: '' });
    } catch (e) {
      setState({ measuring: false, progress: 0, label: '', error: (e as Error).message });
    }
  };
  return { ...state, run };
}

export const SWEEP_OPTIONS = [
  { value: 1, label: '1 s' },
  { value: 2, label: '2 s' },
  { value: 4, label: '4 s' },
] as const;
export const SWEEP_LEVELS = [-24, -18, -12, -6] as const;
