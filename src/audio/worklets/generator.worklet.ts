/// <reference path="./worklet-env.d.ts" />
import { DEFAULT_GENERATOR, SignalSource } from '../../dsp/generators';
import type { GeneratorCommand } from '../messages';

class GeneratorProcessor extends AudioWorkletProcessor {
  private src = new SignalSource(sampleRate, { ...DEFAULT_GENERATOR });

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<GeneratorCommand>) => {
      this.src.params = e.data.params;
      this.src.setRunning(e.data.running);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const left = out[0];
    const right = out[1];
    if (this.src.silent) return true; // outputs are already zeroed
    const ch = this.src.params.channels;
    for (let i = 0; i < left.length; i++) {
      const v = this.src.next();
      left[i] = ch === 'right' ? 0 : v;
      if (right) right[i] = ch === 'left' ? 0 : v;
    }
    return true;
  }
}

registerProcessor('soundbench-generator', GeneratorProcessor);
