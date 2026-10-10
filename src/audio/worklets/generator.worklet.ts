/// <reference path="./worklet-env.d.ts" />
import { DEFAULT_GENERATOR, SignalSource } from '../../dsp/generators';
import { CAPTURE_BLOCK, type GeneratorCommand, type GeneratorEvent } from '../messages';

class GeneratorProcessor extends AudioWorkletProcessor {
  private src = new SignalSource(sampleRate, { ...DEFAULT_GENERATOR });
  private captureRef = false;
  private refBuf = new Float32Array(CAPTURE_BLOCK);
  private refPos = 0;
  private refFrame = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<GeneratorCommand>) => {
      const msg = e.data;
      if (msg.type === 'captureRef') {
        this.captureRef = msg.enabled;
        this.refPos = 0;
        return;
      }
      this.src.params = msg.params;
      this.src.setRunning(msg.running);
    };
  }

  /** Sends what was played, block-stamped with its context frame, for Transfer Function. */
  private pushRef(block: Float32Array) {
    for (let i = 0; i < block.length; i++) {
      if (this.refPos === 0) this.refFrame = currentFrame + i;
      this.refBuf[this.refPos++] = block[i];
      if (this.refPos === CAPTURE_BLOCK) {
        const full = this.refBuf;
        const msg: GeneratorEvent = { type: 'ref', samples: full, frame: this.refFrame };
        this.port.postMessage(msg, [full.buffer]);
        this.refBuf = new Float32Array(CAPTURE_BLOCK);
        this.refPos = 0;
      }
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const left = out[0];
    const right = out[1];
    if (this.src.silent) {
      if (this.captureRef) this.pushRef(left); // outputs are already zeroed
      return true;
    }
    const ch = this.src.params.channels;
    for (let i = 0; i < left.length; i++) {
      const v = this.src.next();
      left[i] = ch === 'right' ? 0 : v;
      if (right) right[i] = ch === 'left' ? 0 : v;
    }
    if (this.captureRef) this.pushRef(ch === 'right' && right ? right : left);
    return true;
  }
}

registerProcessor('soundbench-generator', GeneratorProcessor);
