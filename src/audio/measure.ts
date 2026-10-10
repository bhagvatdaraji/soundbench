import { engine } from './engine';

export interface Recording {
  /** The signal that was played. */
  played: Float32Array;
  /** Mic samples from `pre` samples before playback started until `tail` after it ended. */
  recorded: Float32Array;
  /** Samples recorded before playback started. */
  pre: number;
  fs: number;
}

/**
 * Plays `signal` through the app's output and records the mic over the same stretch of the
 * audio clock, so the recording and the signal are sample-aligned (apart from the device's
 * own input/output latency, which Calibration can measure).
 */
export async function playAndRecord(
  signal: Float32Array,
  { tailS = 0.5, preS = 0.05, onProgress }: { tailS?: number; preS?: number; onProgress?: (f: number) => void } = {},
): Promise<Recording> {
  const a = engine.audio;
  if (!a || engine.status.mic !== 'on') throw new Error('Start the microphone first.');
  const { ctx, out } = a;
  const fs = ctx.sampleRate;
  const pre = Math.round(preS * fs);
  const total = pre + signal.length + Math.round(tailS * fs);
  const recorded = new Float32Array(total);

  const buffer = ctx.createBuffer(1, signal.length, fs);
  buffer.copyToChannel(signal, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(out);

  const startTime = ctx.currentTime + 0.3;
  const startFrame = Math.round(startTime * fs) - pre;
  const endFrame = startFrame + total;

  const release = engine.useCapture();
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        off();
        reject(new Error('Recording timed out. Is the microphone still running?'));
      }, (total / fs + 4) * 1000);
      const off = engine.on('capture', ({ samples, frame }) => {
        const from = Math.max(frame, startFrame);
        const to = Math.min(frame + samples.length, endFrame);
        if (to > from) recorded.set(samples.subarray(from - frame, to - frame), from - startFrame);
        onProgress?.(Math.min(1, Math.max(0, (frame + samples.length - startFrame) / total)));
        if (frame + samples.length >= endFrame) {
          clearTimeout(timeout);
          off();
          resolve();
        }
      });
      src.start(startTime);
    });
  } finally {
    release();
    src.disconnect();
  }
  return { played: signal, recorded, pre, fs };
}
