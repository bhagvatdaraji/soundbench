import type { ComponentType } from 'react';
import type { IconName } from '../components/Icon';
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
import { TrafficLight } from './traffic/TrafficLight';
import { Saved } from './saved/Saved';
import { Scope } from './scope/Scope';
import { SoundScope } from './soundscope/SoundScope';
import { SplMeter } from './spl/SplMeter';

export interface InstrumentModule {
  id: string;
  title: string;
  blurb: string;
  icon: IconName;
  /** Missing = shown on the home screen as "coming soon". */
  Screen?: ComponentType;
}

/** Order here is the order on the home screen. */
export const MODULES: InstrumentModule[] = [
  { id: 'spl', title: 'SPL Meter', blurb: 'A/C/Z, Fast/Slow, Leq', icon: 'meter', Screen: SplMeter },
  { id: 'level', title: 'Level Meter', blurb: 'Peak, RMS, VU, clip', icon: 'bars', Screen: LevelMeter },
  { id: 'rta', title: 'RTA', blurb: '1/1 & 1/3 octave', icon: 'bars', Screen: Rta },
  { id: 'fft', title: 'FFT', blurb: 'Up to 32k points', icon: 'spectrum', Screen: Fft },
  { id: 'generator', title: 'Generator', blurb: 'Sine, noise, sweep', icon: 'sine', Screen: Generator },
  { id: 'scope', title: 'Scope', blurb: 'Waveform & trigger', icon: 'scope', Screen: Scope },
  { id: 'distortion', title: 'Distortion', blurb: 'THD, THD+N, harmonics', icon: 'peak', Screen: Distortion },
  { id: 'soundscope', title: 'SoundScope', blurb: '1/48 oct + spectrograph', icon: 'waterfall', Screen: SoundScope },
  { id: 'logger', title: 'SPL Logger', blurb: 'Leq over time', icon: 'log', Screen: Logger },
  { id: 'traffic', title: 'Traffic Light', blurb: 'Level vs limit', icon: 'traffic', Screen: TrafficLight },
  { id: 'ir', title: 'Impulse / RT60', blurb: 'ETC, T20, T30, C80', icon: 'impulse', Screen: Impulse },
  { id: 'larsa', title: 'LARSA', blurb: 'Gated speaker response', icon: 'spectrum', Screen: Larsa },
  { id: 'polarity', title: 'Polarity', blurb: '+ / − check', icon: 'polarity', Screen: Polarity },
];

export const SETTINGS_MODULES: InstrumentModule[] = [
  { id: 'calibration', title: 'Calibration', blurb: 'Mic offset', icon: 'target', Screen: Calibration },
  { id: 'saved', title: 'Saved', blurb: 'Measurements & export', icon: 'folder', Screen: Saved },
];
