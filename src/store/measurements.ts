import { useSyncExternalStore } from 'react';

export type MeasurementData =
  | { kind: 'curve'; unit: string; freqs: number[]; levels: number[]; max?: number[] }
  | { kind: 'table'; columns: string[]; rows: (string | number)[][] };

export interface Measurement {
  id: string;
  module: string;
  name: string;
  createdAt: string;
  settings: Record<string, unknown>;
  data: MeasurementData;
  /** Small PNG data URL for the list. */
  thumbnail?: string;
}

const DB = 'soundbench';
const STORE = 'measurements';

let items: Measurement[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => reject(t.error);
  });
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const all = await tx<Measurement[]>('readonly', (s) => s.getAll() as IDBRequest<Measurement[]>);
    items = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    items = []; // storage blocked (private mode): keep working in memory only
  }
  notify();
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveMeasurement(m: Measurement): Promise<void> {
  items = [m, ...items.filter((x) => x.id !== m.id)];
  notify();
  try {
    await tx('readwrite', (s) => s.put(m));
  } catch {
    // in-memory only
  }
}

export async function deleteMeasurement(id: string): Promise<void> {
  items = items.filter((x) => x.id !== id);
  notify();
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    // in-memory only
  }
}

export async function renameMeasurement(id: string, name: string): Promise<void> {
  const m = items.find((x) => x.id === id);
  if (m) await saveMeasurement({ ...m, name });
}

export function useMeasurements(module?: string): Measurement[] {
  const all = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      void load();
      return () => listeners.delete(cb);
    },
    () => items,
  );
  return module ? all.filter((m) => m.module === module) : all;
}

export function defaultName(title: string, d = new Date()): string {
  return `${title} ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}
