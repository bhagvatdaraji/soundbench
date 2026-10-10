import { StipaSource } from './stipa';

/** Paul Kellet's refined pink noise filter applied to white noise (≈ −3 dB/oct, ±0.05 dB). */
export class PinkNoise {
  private b = new Float64Array(7);

  next(white: number): number {
    const b = this.b;
    b[0] = 0.99886 * b[0] + white * 0.0555179;
    b[1] = 0.99332 * b[1] + white * 0.0750759;
    b[2] = 0.969 * b[2] + white * 0.153852;
    b[3] = 0.8665 * b[3] + white * 0.3104856;
    b[4] = 0.55 * b[4] + white * 0.5329522;
    b[5] = -0.7616 * b[5] - white * 0.016898;
    const pink = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + white * 0.5362;
    b[6] = white * 0.115926;
    return pink * 0.3288; // same RMS as the white input (measured)
  }
}

export type Waveform = 'sine' | 'square' | 'triangle' | 'pink' | 'white' | 'sweep' | 'polarity' | 'stipa';

export interface GeneratorParams {
  waveform: Waveform;
  frequency: number;
  /** RMS level in dBFS (0 dBFS = full-scale sine peak). */
  level: number;
  sweepStart: number;
  sweepEnd: number;
  sweepSeconds: number;
  /** Which outputs carry the signal. */
  channels: 'both' | 'left' | 'right';
}

export const DEFAULT_GENERATOR: GeneratorParams = {
  waveform: 'sine',
  frequency: 1000,
  level: -20,
  sweepStart: 20,
  sweepEnd: 20000,
  sweepSeconds: 5,
  channels: 'both',
};

/**
 * Peak-normalized level convention: level is the *peak* of a sine relative to full scale,
 * so 0 dBFS sine peaks at ±1. Other waveforms are scaled to the same RMS as that sine.
 */
export class SignalSource {
  private phase = 0;
  private sweepT = 0;
  private pink = new PinkNoise();
  private pulse: Float32Array | null = null;
  private stipa: StipaSource | null = null;
  private pulseT = 0;
  private seed = 22222;
  private gain = 0;
  private targetGain = 0;

  constructor(private fs: number, public params: GeneratorParams) {}

  private white(): number {
    // xorshift — fast, allocation-free, good enough for test noise
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x;
    return ((x >>> 0) / 4294967296) * 2 - 1; // uniform, RMS = 1/√3
  }

  setRunning(on: boolean): void {
    this.targetGain = on ? 1 : 0;
    if (on && this.gain === 0) this.sweepT = 0;
  }

  get silent(): boolean {
    return this.gain === 0 && this.targetGain === 0;
  }

  next(): number {
    // 10 ms linear ramp avoids clicks on start/stop.
    const ramp = 1 / (0.01 * this.fs);
    if (this.gain < this.targetGain) this.gain = Math.min(this.targetGain, this.gain + ramp);
    else if (this.gain > this.targetGain) this.gain = Math.max(this.targetGain, this.gain - ramp);
    if (this.gain === 0) return 0;

    const p = this.params;
    const amp = 10 ** (p.level / 20); // sine peak
    const rms = amp / Math.SQRT2;
    let v: number;
    switch (p.waveform) {
      case 'sine':
        v = amp * Math.sin(2 * Math.PI * this.phase);
        this.advance(p.frequency);
        break;
      case 'square':
        v = rms * (this.phase < 0.5 ? 1 : -1);
        this.advance(p.frequency);
        break;
      case 'triangle':
        v = rms * Math.sqrt(3) * (this.phase < 0.5 ? 4 * this.phase - 1 : 3 - 4 * this.phase);
        this.advance(p.frequency);
        break;
      case 'white':
        v = rms * Math.sqrt(3) * this.white();
        break;
      case 'pink':
        v = rms * Math.sqrt(3) * this.pink.next(this.white());
        break;
      case 'stipa':
        // unit-RMS STIPA signal at the same RMS as a sine of this level
        if (!this.stipa) this.stipa = new StipaSource(this.fs);
        v = rms * this.stipa.next();
        break;
      case 'polarity': {
        // positive 1 ms raised-cosine pulse, 4 per second (see dsp/polarity.ts)
        if (!this.pulse) {
          const n = Math.max(3, Math.round(0.001 * this.fs));
          this.pulse = Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n));
        }
        v = this.pulseT < this.pulse.length ? amp * this.pulse[this.pulseT] : 0;
        this.pulseT = (this.pulseT + 1) % Math.round(0.25 * this.fs);
        break;
      }
      case 'sweep': {
        // Exponential (log) sweep, repeats.
        const T = Math.max(0.1, p.sweepSeconds);
        const f = p.sweepStart * (p.sweepEnd / p.sweepStart) ** (this.sweepT / T);
        v = amp * Math.sin(2 * Math.PI * this.phase);
        this.advance(f);
        this.sweepT += 1 / this.fs;
        if (this.sweepT >= T) {
          this.sweepT = 0;
          this.phase = 0;
        }
        break;
      }
    }
    return Math.max(-1, Math.min(1, v * this.gain));
  }

  private advance(f: number): void {
    this.phase += f / this.fs;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
  }
}
