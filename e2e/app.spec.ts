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
  expect(num(await readout(page, 'Peak level'))).toBeCloseTo(100, 0);
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
