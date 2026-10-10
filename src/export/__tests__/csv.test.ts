import { expect, it } from 'vitest';
import { fileSafe, measurementCsv, toCsv } from '../csv';

it('escapes quotes, commas and newlines; drops non-finite numbers', () => {
  expect(toCsv([['a,b', 'say "hi"', 1.23456, -Infinity]])).toBe('"a,b","say ""hi""",1.235,\n');
});

it('writes curve measurements with a header row', () => {
  const csv = measurementCsv({
    id: 'x',
    module: 'rta',
    name: 'Room 1',
    createdAt: '2026-10-10T00:00:00.000Z',
    settings: {},
    data: { kind: 'curve', unit: 'dB', freqs: [1000, 2000], levels: [80, 70.5], max: [82, 71] },
  });
  const lines = csv.trim().split('\n');
  expect(lines[3]).toBe('frequency_hz,level_dB,max_dB');
  expect(lines[4]).toBe('1000,80,82');
  expect(lines[5]).toBe('2000,70.5,71');
});

it('makes file-safe names', () => {
  expect(fileSafe('RTA Oct 10, 14:32')).toBe('RTA_Oct_10_14_32');
});
