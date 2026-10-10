/** Smallest power we display, avoids log(0). */
export const POWER_FLOOR = 1e-15;

/**
 * dBFS follows AES17: a full-scale sine reads 0 dBFS. Mean-square power of that sine is 0.5,
 * so dBFS = 10·log10(2·ms).
 */
export const msToDbfs = (ms: number): number => 10 * Math.log10(Math.max(2 * ms, POWER_FLOOR));
export const dbfsToMs = (db: number): number => 10 ** (db / 10) / 2;

/** Per-sample coefficient for an exponential average with time constant tau (s). */
export const expCoeff = (tau: number, fs: number): number => 1 - Math.exp(-1 / (tau * fs));

/** IEC 61672 time weightings. Impulse: 35 ms rise, 1.5 s decay. */
export type TimeWeighting = 'F' | 'S' | 'I';
export const TIME_WEIGHTINGS: TimeWeighting[] = ['F', 'S', 'I'];
export const TAU = { F: 0.125, S: 1, I: 0.035, IDecay: 1.5 } as const;
