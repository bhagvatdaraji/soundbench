export type Slope = 'rising' | 'falling';

/**
 * Finds the latest trigger crossing in x[from..to) at `level` with hysteresis, so noise
 * around the level doesn't retrigger. Returns a fractional index, or -1.
 */
export function findTrigger(
  x: ArrayLike<number>,
  level: number,
  slope: Slope,
  from: number,
  to: number,
  hysteresis = 0.002,
): number {
  const lo = Math.max(1, from);
  const hi = Math.min(x.length, to);
  // Walk backwards for the most recent crossing; require the signal to have been
  // beyond the hysteresis band on the far side before it.
  for (let i = hi - 1; i >= lo; i--) {
    const a = x[i - 1];
    const b = x[i];
    const crossed = slope === 'rising' ? a < level && b >= level : a > level && b <= level;
    if (!crossed) continue;
    const armLevel = slope === 'rising' ? level - hysteresis : level + hysteresis;
    let armed = false;
    for (let j = i - 1; j >= Math.max(0, i - 4096); j--) {
      if (slope === 'rising' ? x[j] < armLevel : x[j] > armLevel) {
        armed = true;
        break;
      }
      if (slope === 'rising' ? x[j] > level : x[j] < level) break;
    }
    if (!armed) continue;
    return i - 1 + (level - a) / (b - a);
  }
  return -1;
}

/** Frequency from the average period between rising zero crossings (with interpolation). */
export function estimateFrequency(x: ArrayLike<number>, fs: number): number {
  let first = -1;
  let last = -1;
  let count = 0;
  let mean = 0;
  for (let i = 0; i < x.length; i++) mean += x[i];
  mean /= x.length || 1;
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i] - mean));
  const hyst = peak * 0.1;
  let armed = false;
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1] - mean;
    const b = x[i] - mean;
    if (b < -hyst) armed = true;
    if (armed && a < 0 && b >= 0) {
      const t = i - 1 + -a / (b - a);
      if (first < 0) first = t;
      else count++;
      last = t;
      armed = false;
    }
  }
  if (count < 1) return NaN;
  return (count * fs) / (last - first);
}
