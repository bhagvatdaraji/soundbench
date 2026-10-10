import { expect, type Page } from '@playwright/test';

/** Collects page errors and console errors so each test can assert there were none. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

export async function startMic(page: Page) {
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.locator('.mic-gate')).toHaveCount(0);
}

/** Reads the numeric value of a Readout by its label. */
export async function readout(page: Page, label: string | RegExp): Promise<string> {
  const r = page.locator('.readout').filter({ has: page.locator('.readout-label', { hasText: label }) }).first();
  return (await r.locator('.readout-value').innerText()).trim();
}

export const num = (s: string) => parseFloat(s.replace(/[^\d.\-]/g, ''));
