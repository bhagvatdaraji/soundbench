import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'soundbench:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    // Merge so new settings fields get defaults after an update.
    return fallback && typeof fallback === 'object' && !Array.isArray(fallback)
      ? { ...fallback, ...parsed }
      : parsed;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // private mode / storage blocked: settings just won't persist
  }
}

/** useState that survives reloads. Object values are shallow-merged with defaults. */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback));
  useEffect(() => save(key, value), [key, value]);
  const patch = useCallback(
    (p: Partial<T>) => setValue((v) => ({ ...v, ...p })),
    [],
  );
  return [value, setValue, patch] as const;
}
