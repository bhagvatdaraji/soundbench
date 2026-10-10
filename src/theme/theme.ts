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
  /** Heat-map stops, quiet → loud. */
  heat: string[];
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
    heat: [0, 1, 2, 3, 4].map((i) => v(`--heat-${i}`)),
  };
  return cached;
}

/** 256-entry RGB lookup table interpolated through the given hex color stops. */
export function colorRamp(stops: string[]): Uint8ClampedArray {
  const rgb = stops.map((h) => {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (rgb.length - 1);
    const a = Math.min(rgb.length - 2, Math.floor(t));
    const f = t - a;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = rgb[a][c] + (rgb[a + 1][c] - rgb[a][c]) * f;
  }
  return lut;
}
