/** Reads design tokens from CSS so canvas drawing uses the same palette as the DOM. */
export interface CanvasTheme {
  bg: string;
  grid: string;
  gridMajor: string;
  axisLabel: string;
  live: string;
  liveDim: string;
  maxHold: string;
  secondary: string;
  warn: string;
  text: string;
  fontNum: string;
}

let cached: CanvasTheme | null = null;

export function canvasTheme(): CanvasTheme {
  if (cached) return cached;
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  cached = {
    bg: v('--bg'),
    grid: v('--grid'),
    gridMajor: v('--grid-major'),
    axisLabel: v('--axis-label'),
    live: v('--live'),
    liveDim: v('--live-dim'),
    maxHold: v('--max-hold'),
    secondary: v('--secondary'),
    warn: v('--warn'),
    text: v('--text'),
    fontNum: v('--font-num'),
  };
  return cached;
}
