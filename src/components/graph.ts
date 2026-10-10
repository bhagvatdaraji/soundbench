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

/** Linear x/y plot area (time-domain views). */
export interface LinPlot {
  x: number;
  y: number;
  w: number;
  h: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function linPlot(w: number, h: number, r: Omit<LinPlot, 'x' | 'y' | 'w' | 'h'>): LinPlot {
  return { x: 40, y: 18, w: Math.max(10, w - 56), h: Math.max(10, h - 40), ...r };
}
export const xLin = (p: LinPlot, v: number) => p.x + ((v - p.xMin) / (p.xMax - p.xMin)) * p.w;
export const yLin = (p: LinPlot, v: number) => p.y + ((p.yMax - v) / (p.yMax - p.yMin)) * p.h;

/** A 1-2-5 step giving roughly `target` divisions over `span`. */
export function niceStep(span: number, target = 6): number {
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

export function drawLinGrid(
  ctx: CanvasRenderingContext2D,
  p: LinPlot,
  { xFmt = (v: number) => String(+v.toFixed(3)), yFmt = (v: number) => String(+v.toFixed(2)), xUnit = '', yUnit = '' } = {},
): void {
  const t = canvasTheme();
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = `10px ${t.fontNum}`;
  ctx.fillStyle = t.axisLabel;
  const xs = niceStep(p.xMax - p.xMin);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = Math.ceil(p.xMin / xs) * xs; v <= p.xMax + 1e-9; v += xs) {
    const X = Math.round(xLin(p, v)) + 0.5;
    ctx.strokeStyle = t.grid;
    ctx.beginPath();
    ctx.moveTo(X, p.y);
    ctx.lineTo(X, p.y + p.h);
    ctx.stroke();
    ctx.fillText(xFmt(v), X, p.y + p.h + 5);
  }
  const ys = niceStep(p.yMax - p.yMin, 5);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(p.yMin / ys) * ys; v <= p.yMax + 1e-9; v += ys) {
    const Y = Math.round(yLin(p, v)) + 0.5;
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? t.gridMajor : t.grid;
    ctx.beginPath();
    ctx.moveTo(p.x, Y);
    ctx.lineTo(p.x + p.w, Y);
    ctx.stroke();
    ctx.fillText(yFmt(v), p.x - 5, Y);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (yUnit) ctx.fillText(yUnit, 4, 2);
  ctx.textAlign = 'right';
  if (xUnit) ctx.fillText(xUnit, p.x + p.w, 2);
  ctx.restore();
}

/** Polyline of y[i] at x = x0 + i·dx, decimated to min/max per pixel column. */
export function drawSeries(
  ctx: CanvasRenderingContext2D,
  p: LinPlot,
  y: ArrayLike<number>,
  x0: number,
  dx: number,
  color: string,
  width = 1.2,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y, p.w, p.h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const i0 = Math.max(0, Math.floor((p.xMin - x0) / dx));
  const i1 = Math.min(y.length - 1, Math.ceil((p.xMax - x0) / dx));
  const perPx = (i1 - i0) / p.w;
  const clampY = (v: number) => Math.min(p.y + p.h + 2, Math.max(p.y - 2, yLin(p, v)));
  if (perPx <= 3) {
    for (let i = i0; i <= i1; i++) {
      const X = xLin(p, x0 + i * dx);
      if (i === i0) ctx.moveTo(X, clampY(y[i]));
      else ctx.lineTo(X, clampY(y[i]));
    }
  } else {
    for (let c = 0; c < p.w; c++) {
      const a = i0 + Math.floor(c * perPx);
      const b = Math.min(i1, i0 + Math.floor((c + 1) * perPx));
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = a; i <= b; i++) {
        if (y[i] < lo) lo = y[i];
        if (y[i] > hi) hi = y[i];
      }
      const X = p.x + c;
      if (c === 0) ctx.moveTo(X, clampY(hi));
      else ctx.lineTo(X, clampY(hi));
      ctx.lineTo(X, clampY(lo));
    }
  }
  ctx.stroke();
  ctx.restore();
}
