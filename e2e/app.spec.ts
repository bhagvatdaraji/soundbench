import { expect, test } from '@playwright/test';
import { num, readout, startMic, trackErrors } from './helpers';

// The fake mic plays a 1 kHz sine at −20 dBFS. With the default offset (120 dB) that reads 100 dB.

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
});

test('home lists the instruments', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'SoundBench' })).toBeVisible();
  for (const name of ['SPL Meter', 'RTA', 'FFT', 'Generator']) {
    await expect(page.locator('.tile', { hasText: name }).first()).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test('SPL meter reads the tone level', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/spl');
  await startMic(page);
  await expect.poll(async () => num(await page.locator('.spl-big-value').innerText()), { timeout: 10_000 }).toBeCloseTo(100, 0);
  // A-weighting is 0 dB at 1 kHz, so C and Z agree.
  await page.getByRole('radio', { name: 'Z' }).click();
  await expect.poll(async () => num(await page.locator('.spl-big-value').innerText())).toBeCloseTo(100, 0);
  expect(num(await readout(page, /eq$/i))).toBeGreaterThan(98);
  expect(errors).toEqual([]);
});

test('RTA shows the tone in the 1 kHz band', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/rta');
  await startMic(page);
  await expect.poll(async () => num(await readout(page, 'Total')), { timeout: 10_000 }).toBeCloseTo(100, 0);
  expect(errors).toEqual([]);
});

test('FFT finds the 1 kHz peak', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/fft');
  await startMic(page);
  await expect.poll(async () => await readout(page, /^Peak$/), { timeout: 10_000 }).toBe('1.000 kHz');
  await expect.poll(async () => num(await readout(page, 'Peak level'))).toBeCloseTo(100, 0);
  // Smoothing changes the trace, not the peak readout.
  await page.getByRole('radio', { name: '1/6' }).click();
  await page.waitForTimeout(500);
  expect(await readout(page, /^Peak$/)).toBe('1.000 kHz');
  expect(errors).toEqual([]);
});

test('calibration sets the offset to a reference', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/calibration');
  await startMic(page);
  const set = page.getByRole('button', { name: 'Set', exact: true });
  await expect(set).toBeEnabled({ timeout: 15_000 });
  await set.click();
  await expect.poll(async () => num(await readout(page, 'Reads as'))).toBeCloseTo(94, 0);
  // The uncalibrated badge disappears everywhere.
  await page.goto('./#/spl');
  await expect(page.getByRole('button', { name: 'Uncalibrated' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('generator starts and stops', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/generator');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.getByRole('radio', { name: 'Pink' }).click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('scope triggers on the tone and reads its frequency', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/scope');
  await startMic(page);
  await expect.poll(async () => await readout(page, 'Trigger'), { timeout: 10_000 }).toBe('trig’d');
  await expect.poll(async () => num(await readout(page, 'Freq'))).toBeCloseTo(1, 2); // "1.000 kHz"
  expect(num(await readout(page, 'RMS'))).toBeCloseTo(-20, 0);
  expect(errors).toEqual([]);
});

test('save an RTA snapshot, use it as reference, export CSV, and find it after reload', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/rta');
  await startMic(page);
  await expect.poll(async () => num(await readout(page, 'Total')), { timeout: 10_000 }).toBeCloseTo(100, 0);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Measurement name').fill('Living room');
  await page.getByRole('button', { name: 'Save snapshot' }).click();
  await expect(page.getByRole('status')).toContainText('Living room');
  await page.getByRole('radio', { name: 'Living room' }).click();
  await expect(page.getByRole('radio', { name: 'Living room' })).toHaveAttribute('aria-checked', 'true');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await (await file.createReadStream())!.toArray();
  const text = Buffer.concat(csv).toString();
  expect(text).toContain('frequency_hz,level_dB,max_dB');
  expect(text).toMatch(/\n1000,(99|100)\./);

  await page.goto('./#/saved');
  await page.reload();
  await expect(page.locator('.saved-item', { hasText: 'Living room' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('SoundScope finds the 1 kHz peak', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/soundscope');
  await startMic(page);
  await expect.poll(async () => await readout(page, /^Peak$/), { timeout: 10_000 }).toMatch(/^(1\.000 kHz|99\d\.\d Hz)$/);
  await expect.poll(async () => num(await readout(page, 'Peak level'))).toBeGreaterThan(97);
  expect(errors).toEqual([]);
});

test('SPL logger records rows at the chosen interval', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/logger');
  await startMic(page);
  await page.getByRole('radio', { name: '1 s' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect.poll(async () => Number(await readout(page, 'Rows')), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  expect(num(await readout(page, 'LAeq'))).toBeCloseTo(100, 0);
  await page.getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('traffic light follows the limit', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/traffic');
  await startMic(page);
  await page.getByRole('radio', { name: 'LAF' }).click();
  const box = page.locator('.traffic');
  await page.getByRole('button', { name: 'Limit', exact: true }).click();
  await page.getByRole('radio', { name: '90' }).click(); // 100 dB ≥ 90 → red
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(box).toHaveAttribute('data-light', 'red', { timeout: 10_000 });
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Raise limit' }).click(); // 102 → amber (within 3 dB)
  await expect(box).toHaveAttribute('data-light', 'amber');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Raise limit' }).click(); // 106 → green
  await expect(box).toHaveAttribute('data-light', 'green');
  expect(errors).toEqual([]);
});

test('level meter reads the tone in dBFS', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./#/level');
  await startMic(page);
  await expect.poll(async () => num(await readout(page, /^RMS$/)), { timeout: 10_000 }).toBeCloseTo(-20, 0);
  expect(num(await readout(page, 'Crest'))).toBeCloseTo(3, 0);
  await expect(page.getByRole('status')).toHaveText('No clipping');
  expect(errors).toEqual([]);
});

test.describe('loopback measurements', () => {
  test('distortion: clean loop ≈ 0 %, distorting loop ≈ 1 % THD', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./?loopback=direct#/distortion');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await startMic(page);
    await page.getByRole('button', { name: 'Start test' }).click();
    await expect.poll(async () => await readout(page, 'Fundamental'), { timeout: 10_000 }).toBe('1.000 kHz');
    await expect.poll(async () => num(await readout(page, /^THD$/))).toBeLessThan(0.05);

    await page.goto('./?loopback=dist#/distortion');
    await startMic(page);
    await page.getByRole('button', { name: 'Start test' }).click();
    // cubic shaper, k = 0.64 at −12 dBFS (peak 0.251): H3/H1 = k·A²/4 ≈ 1.0 %
    await expect.poll(async () => num(await readout(page, /^THD$/)), { timeout: 10_000 }).toBeGreaterThan(0.85);
    expect(num(await readout(page, /^THD$/))).toBeLessThan(1.2);
    expect(errors).toEqual([]);
  });
});
