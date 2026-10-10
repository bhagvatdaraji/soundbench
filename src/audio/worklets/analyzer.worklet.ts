/// <reference path="./worklet-env.d.ts" />
import { RtaCore } from '../../dsp/rtaCore';
import { SplCore } from '../../dsp/splCore';
import { CAPTURE_BLOCK, REPORT_RATE, type AnalyzerCommand, type AnalyzerEvent } from '../messages';

/** Runs the SPL meter always, the RTA filter bank on demand, and forwards raw audio on demand. */
class AnalyzerProcessor extends AudioWorkletProcessor {
  private spl = new SplCore(sampleRate);
  private rta: RtaCore | null = null;
  private rtaResolution: 1 | 3 = 3;
  private capture = false;
  private captureBuf = new Float32Array(CAPTURE_BLOCK);
  private capturePos = 0;
  private readonly reportEvery = Math.round(sampleRate / REPORT_RATE);
  private sinceReport = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<AnalyzerCommand>) => {
      const msg = e.data;
      if (msg.type === 'rta') {
        if (msg.resolution === null) this.rta = null;
        else if (!this.rta || this.rtaResolution !== msg.resolution) {
          this.rtaResolution = msg.resolution;
          this.rta = new RtaCore(sampleRate, msg.resolution);
        }
      } else if (msg.type === 'capture') {
        this.capture = msg.enabled;
        this.capturePos = 0;
      }
    };
  }

  private post(msg: AnalyzerEvent, transfer: Transferable[] = []) {
    this.port.postMessage(msg, transfer);
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;

    this.spl.process(input);
    this.rta?.process(input);

    if (this.capture) {
      let i = 0;
      while (i < input.length) {
        const n = Math.min(input.length - i, CAPTURE_BLOCK - this.capturePos);
        this.captureBuf.set(input.subarray(i, i + n), this.capturePos);
        this.capturePos += n;
        i += n;
        if (this.capturePos === CAPTURE_BLOCK) {
          const full = this.captureBuf;
          this.post({ type: 'capture', samples: full }, [full.buffer]);
          this.captureBuf = new Float32Array(CAPTURE_BLOCK);
          this.capturePos = 0;
        }
      }
    }

    this.sinceReport += input.length;
    if (this.sinceReport >= this.reportEvery) {
      this.sinceReport = 0;
      this.post({ type: 'spl', report: this.spl.takeReport() });
      if (this.rta) {
        const { ms, samples } = this.rta.takeMeanSquares();
        this.post({ type: 'rta', resolution: this.rtaResolution, ms, samples }, [ms.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('soundbench-analyzer', AnalyzerProcessor);
