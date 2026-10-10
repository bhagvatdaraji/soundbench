import { useEffect, useRef } from 'react';
import { engine } from './engine';

export interface CaptureRing {
  buf: Float32Array;
  /** Next write index. */
  pos: number;
  /** Samples written so far, capped at buf.length. */
  filled: number;
  /** Total samples ever written (for detecting new data). */
  total: number;
}

/** Keeps the most recent `size` mic samples in a ring buffer while mounted. */
export function useCaptureRing(size: number): React.MutableRefObject<CaptureRing> {
  const ring = useRef<CaptureRing>({ buf: new Float32Array(size), pos: 0, filled: 0, total: 0 });
  useEffect(() => {
    const release = engine.useCapture();
    const off = engine.on('capture', ({ samples }) => {
      const r = ring.current;
      const n = r.buf.length;
      for (let i = 0; i < samples.length; i++) {
        r.buf[r.pos] = samples[i];
        r.pos = r.pos + 1 === n ? 0 : r.pos + 1;
      }
      r.filled = Math.min(n, r.filled + samples.length);
      r.total += samples.length;
    });
    return () => {
      release();
      off();
    };
  }, []);
  return ring;
}

/** Copies the newest `out.length` samples (oldest first). Returns false if not enough data yet. */
export function readLatest(r: CaptureRing, out: Float32Array, endOffset = 0): boolean {
  const n = r.buf.length;
  if (r.filled < out.length + endOffset) return false;
  let i = (r.pos - out.length - endOffset + 2 * n) % n;
  for (let k = 0; k < out.length; k++) {
    out[k] = r.buf[i];
    i = i + 1 === n ? 0 : i + 1;
  }
  return true;
}
