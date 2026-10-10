import { expect, it } from 'vitest';
import { RollingLeq } from '../rollingLeq';

it('averages energy over the most recent window only', () => {
  const r = new RollingLeq(100);
  for (let i = 0; i < 10; i++) r.add(10 * 1, 10); // ms 1 for 100 samples
  expect(r.meanSquare).toBeCloseTo(1);
  expect(r.fill).toBe(1);
  for (let i = 0; i < 10; i++) r.add(10 * 0.01, 10); // window now entirely quiet
  expect(r.meanSquare).toBeCloseTo(0.01);
  r.add(10 * 1, 10); // one loud chunk in ten
  expect(r.meanSquare).toBeCloseTo((9 * 0.1 + 10) / 100);
});
