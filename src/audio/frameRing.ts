import { useEffect, useRef } from 'react';
import { engine } from './engine';

/** Ring buffer indexed by absolute audio-clock frame, so two streams can be aligned exactly. */
export class FrameRing {
  readonly buf: Float32Array;
  /** One past the newest frame written (−1 before any data). */
  end = -1;
  private start = -1;

  constructor(size: number) {
    this.buf = new Float32Array(size);
  }

  write(samples: Float32Array, frame: number): void {
    const n = this.buf.length;
    if (this.start < 0) this.start = frame;
    for (let i = 0; i < samples.length; i++) this.buf[(frame + i) % n] = samples[i];
    this.end = frame + samples.length;
  }

  /** Copies frames [endFrame − out.length, endFrame). False if they're not all available. */
  read(endFrame: number, out: Float32Array): boolean {
    const n = this.buf.length;
    const from = endFrame - out.length;
    if (this.end < 0 || endFrame > this.end || from < Math.max(this.start, this.end - n)) return false;
    for (let i = 0; i < out.length; i++) out[i] = this.buf[(from + i) % n];
    return true;
  }
}

/** Keeps mic ('capture') or generator ('ref') samples in a FrameRing while mounted. */
export function useFrameRing(source: 'capture' | 'ref', size: number): FrameRing {
  const ring = useRef<FrameRing>(new FrameRing(size));
  useEffect(() => {
    const release = source === 'capture' ? engine.useCapture() : engine.useRefCapture();
    const off = engine.on(source, ({ samples, frame }) => ring.current.write(samples, frame));
    return () => {
      release();
      off();
    };
  }, [source]);
  return ring.current;
}
