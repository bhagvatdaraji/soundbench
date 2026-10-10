import { expect, it } from 'vitest';
import { formatFreq } from '../format';

it('formats frequencies, rounding before choosing the unit', () => {
  expect(formatFreq(440)).toBe('440.0 Hz');
  expect(formatFreq(999.97)).toBe('1.000 kHz');
  expect(formatFreq(1234.5)).toBe('1.234 kHz');
  expect(formatFreq(9999.9)).toBe('10.00 kHz');
  expect(formatFreq(15000)).toBe('15.00 kHz');
});
