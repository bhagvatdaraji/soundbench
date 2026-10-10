import type { ComponentType } from 'react';
import type { IconName } from '../components/Icon';
import { About } from './about/About';
import { Calibration } from './calibration/Calibration';
import { Distortion } from './distortion/Distortion';
import { Fft } from './fft/Fft';
import { Generator } from './generator/Generator';
import { Impulse } from './impulse/Impulse';
import { Larsa } from './larsa/Larsa';
import { LevelMeter } from './level/LevelMeter';
import { Logger } from './logger/Logger';
import { Polarity } from './polarity/Polarity';
import { Rta } from './rta/Rta';
import { Saved } from './saved/Saved';
import { Scope } from './scope/Scope';
import { SoundScope } from './soundscope/SoundScope';
import { SplMeter } from './spl/SplMeter';
import { Stipa } from './stipa/Stipa';
import { TrafficLight } from './traffic/TrafficLight';
import { Transfer } from './transfer/Transfer';

export type ModuleGroup = 'measure' | 'analyze' | 'acoustics' | 'generate' | 'setup';

export interface InstrumentModule {
  id: string;
  title: string;
  blurb: string;
  icon: IconName;
  group: ModuleGroup;
  Screen: ComponentType;
  /** One-paragraph help shown on the About screen. */
  help: string;
}

export const GROUPS: { id: ModuleGroup; title: string }[] = [
  { id: 'measure', title: 'Measure' },
  { id: 'analyze', title: 'Analyze' },
  { id: 'acoustics', title: 'Room & speakers' },
  { id: 'generate', title: 'Generate' },
  { id: 'setup', title: 'Setup' },
];

/** Order here is the order on the home screen (within each group). */
export const MODULES: InstrumentModule[] = [
  { id: 'spl', group: 'measure', title: 'SPL Meter', blurb: 'A/C/Z, Fast/Slow, Leq', icon: 'meter', Screen: SplMeter,
    help: 'Sound level with A, C or Z weighting and Fast, Slow or Impulse time weighting, plus Leq, Max, Min and Peak since reset. Calibrate first for true dB SPL.' },
  { id: 'level', group: 'measure', title: 'Level Meter', blurb: 'Peak, RMS, VU, clip', icon: 'vu', Screen: LevelMeter,
    help: 'Digital input levels in dBFS: sample peak with hold, RMS, VU ballistics, crest factor and a clip counter.' },
  { id: 'logger', group: 'measure', title: 'SPL Logger', blurb: 'Leq over time', icon: 'log', Screen: Logger,
    help: 'Logs LAeq, LAFmax and LCpeak every 1 s, 10 s or 1 min with L10/L90. Keeps running while you use other instruments; export as CSV.' },
  { id: 'traffic', group: 'measure', title: 'Traffic Light', blurb: 'Level vs limit', icon: 'traffic', Screen: TrafficLight,
    help: 'Green, amber or red against a limit, using LAF or a rolling 1/5/15-minute LAeq. Shows time over the limit.' },
  { id: 'rta', group: 'analyze', title: 'RTA', blurb: '1/1 & 1/3 octave', icon: 'bars', Screen: Rta,
    help: 'Real-time analyzer with octave or third-octave filter bands, Fast/Slow/Leq averaging, max hold and saved reference traces.' },
  { id: 'fft', group: 'analyze', title: 'FFT', blurb: 'Up to 32k points', icon: 'spectrum', Screen: Fft,
    help: 'High-resolution spectrum (4k–32k points) with window choice, smoothing, averaging, max hold, a pink-flat view and peak/cursor readouts.' },
  { id: 'soundscope', group: 'analyze', title: 'SoundScope', blurb: '1/48 oct + spectrograph', icon: 'waterfall', Screen: SoundScope,
    help: 'Fine 1/48-octave spectrum above a scrolling spectrograph, handy for spotting feedback and resonances over time.' },
  { id: 'scope', group: 'analyze', title: 'Scope', blurb: 'Waveform & trigger', icon: 'scope', Screen: Scope,
    help: 'Oscilloscope with edge trigger, timebase, freeze, and frequency/level readouts. Tap the graph to set the trigger level.' },
  { id: 'distortion', group: 'analyze', title: 'Distortion', blurb: 'THD, THD+N, harmonics', icon: 'clip', Screen: Distortion,
    help: 'Plays a test sine (or listens to an external one) and measures THD, THD+N and harmonics H2–H10.' },
  { id: 'ir', group: 'acoustics', title: 'Impulse / RT60', blurb: 'ETC, T20, T30, C80', icon: 'impulse', Screen: Impulse,
    help: 'Measures a room with a log sweep: impulse response, energy-time curve, decay curves and RT metrics (EDT, T20, T30, C50, C80, D50, Ts) per octave.' },
  { id: 'larsa', group: 'acoustics', title: 'LARSA', blurb: 'Gated speaker response', icon: 'gate', Screen: Larsa,
    help: 'Speaker response without the room: the impulse is time-gated before the first reflection. Drag to set the gate.' },
  { id: 'transfer', group: 'acoustics', title: 'Transfer Function', blurb: 'Response, phase, delay', icon: 'transfer', Screen: Transfer,
    help: 'Compares what the phone plays with what the mic hears: magnitude, phase, coherence, and a delay finder with A/B memories for main/sub alignment.' },
  { id: 'polarity', group: 'acoustics', title: 'Polarity', blurb: '+ / − check', icon: 'polarity', Screen: Polarity,
    help: 'Checks whether a speaker pushes or pulls first, either with this phone as the source or by listening to the Polarity signal from another device.' },
  { id: 'stipa', group: 'acoustics', title: 'STIPA', blurb: 'Speech intelligibility (exp.)', icon: 'speech', Screen: Stipa,
    help: 'Experimental speech transmission index (STI) using the STIPA test signal. Simplified, so use it for comparisons rather than compliance.' },
  { id: 'generator', group: 'generate', title: 'Generator', blurb: 'Sine, noise, sweep…', icon: 'sine', Screen: Generator,
    help: 'Sine, square, triangle, pink and white noise, log sweep, and the Polarity and STIPA test signals. Can run while you use any instrument.' },
  { id: 'calibration', group: 'setup', title: 'Mic & Calibration', blurb: 'Input, level, latency', icon: 'mic', Screen: Calibration,
    help: 'Choose which microphone or interface input to use, calibrate its level against a calibrator or trusted meter, and measure the speaker→mic latency. Each mic keeps its own calibration.' },
  { id: 'saved', group: 'setup', title: 'Saved', blurb: 'Measurements & export', icon: 'folder', Screen: Saved,
    help: 'Everything you saved: rename, delete, or export as CSV.' },
  { id: 'about', group: 'setup', title: 'About & help', blurb: 'What each tool does', icon: 'info', Screen: About,
    help: 'This screen.' },
];
