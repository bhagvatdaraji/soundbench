import type { BandResolution } from '../dsp/bands';
import type { GeneratorParams } from '../dsp/generators';
import type { SplReport } from '../dsp/splCore';

/** Main thread → analyzer worklet. */
export type AnalyzerCommand =
  | { type: 'rta'; resolution: BandResolution | null }
  | { type: 'capture'; enabled: boolean };

/** Analyzer worklet → main thread. */
export type AnalyzerEvent =
  | { type: 'spl'; report: SplReport }
  | { type: 'rta'; resolution: BandResolution; ms: Float64Array; samples: number }
  | { type: 'capture'; samples: Float32Array };

/** Main thread → generator worklet. */
export type GeneratorCommand = { type: 'set'; params: GeneratorParams; running: boolean };

/** Reports per second sent from the analyzer worklet. */
export const REPORT_RATE = 30;
/** Samples per raw capture block sent to the main thread (FFT, scope). */
export const CAPTURE_BLOCK = 2048;
