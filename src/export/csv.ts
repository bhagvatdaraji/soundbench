import type { Measurement } from '../store/measurements';

const cell = (v: string | number): string => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toFixed(3)) : '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

/** CSV for a saved or live measurement, with a small metadata header. */
export function measurementCsv(m: Measurement): string {
  const meta: (string | number)[][] = [
    ['# SoundBench', m.module],
    ['# name', m.name],
    ['# created', m.createdAt],
  ];
  const d = m.data;
  if (d.kind === 'curve') {
    const head = ['frequency_hz', `level_${d.unit}`, ...(d.max ? [`max_${d.unit}`] : [])];
    const rows = d.freqs.map((f, i) => [f, d.levels[i], ...(d.max ? [d.max[i]] : [])]);
    return toCsv([...meta, head, ...rows]);
  }
  return toCsv([...meta, d.columns, ...d.rows]);
}

export function fileSafe(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'measurement';
}
