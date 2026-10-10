import { canvasTheme } from '../theme/theme';
import { formatHz } from '../dsp/bands';

export interface Plot {
  /** Plot area in CSS pixels inside the canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  fMin: number;
  fMax: number;
  dbMin: number;
  dbMax: number;
}

export const xOfFreq = (p: Plot, f: number) =>
  p.x + (Math.log(f / p.fMin) / Math.log(p.fMax / p.fMin)) * p.w;
export const freqOfX = (p: Plot, x: number) =>
  p.fMin * (p.fMax / p.fMin) ** ((x - p.x) / p.w);
export const yOfDb = (p: Plot, db: number) =>
  p.y + ((p.dbMax - db) / (p.dbMax - p.dbMin)) * p.h;

const FREQ_GRID = [20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900,
  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000];
const FREQ_LABELS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

/** Computes the plot rect leaving room for axis labels. */
export function plotRect(w: number, h: number, range: Omit<Plot, 'x' | 'y' | 'w' | 'h'>): Plot {
  const left = 34;
  const bottom = 20;
  const top = 18;
  return { x: left, y: top, w: Math.max(10, w - left - 16), h: Math.max(10, h - top - bottom), ...range };
}

/** Log-frequency / dB grid with labels. */
export function drawGrid(ctx: CanvasRenderingContext2D, p: Plot, dbStep = 10, unit = 'dB'): void {
  const t = canvasTheme();
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = `10px ${t.fontNum}`;
  ctx.fillStyle = t.axisLabel;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const f of FREQ_GRID) {
    if (f < p.fMin || f > p.fMax) continue;
    const x = Math.round(xOfFreq(p, f)) + 0.5;
    const major = FREQ_LABELS.includes(f);
    ctx.strokeStyle = major ? t.gridMajor : t.grid;
    ctx.beginPath();
    ctx.moveTo(x, p.y);
    ctx.lineTo(x, p.y + p.h);
    ctx.stroke();
    if (major) ctx.fillText(formatHz(f), x, p.y + p.h + 5);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const first = Math.ceil(p.dbMin / dbStep) * dbStep;
  for (let db = first; db <= p.dbMax; db += dbStep) {
    const y = Math.round(yOfDb(p, db)) + 0.5;
    ctx.strokeStyle = t.gridMajor;
    ctx.beginPath();
    ctx.moveTo(p.x, y);
    ctx.lineTo(p.x + p.w, y);
    ctx.stroke();
    ctx.fillText(String(db), p.x - 5, y);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(unit, 4, 2);
  ctx.restore();
}

/** Polyline through (frequency, dB) points, e.g. a saved reference trace. */
export function drawCurve(
  ctx: CanvasRenderingContext2D,
  p: Plot,
  freqs: ArrayLike<number>,
  levels: ArrayLike<number>,
  color: string,
  width = 1.5,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y, p.w, p.h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    const l = levels[i];
    if (!Number.isFinite(l) || f < p.fMin || f > p.fMax) {
      pen = false;
      continue;
    }
    const x = xOfFreq(p, f);
    const y = Math.min(p.y + p.h + 2, Math.max(p.y - 2, yOfDb(p, l)));
    if (pen) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    pen = true;
  }
  ctx.stroke();
  ctx.restore();
}
