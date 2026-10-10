/**
 * Hidden test mode: open the app with `?loopback=direct|room|invert|dist` and the "microphone"
 * becomes this app's own output played through a simulated room. It lets every speaker→mic
 * measurement run in automated tests (and works as a demo without a speaker).
 */
export type LoopbackMode = 'direct' | 'room' | 'invert' | 'dist';

export const LOOPBACK_DELAY_S = 0.005;
export const LOOPBACK_RT60 = 0.6;
/** Cubic waveshaper coefficient for `dist`: 3rd harmonic = k·A²/4 of the fundamental. */
export const LOOPBACK_DIST_K = 0.64;

export function loopbackMode(): LoopbackMode | null {
  try {
    const m = new URLSearchParams(location.search).get('loopback');
    return m === 'direct' || m === 'room' || m === 'invert' || m === 'dist' ? m : null;
  } catch {
    return null;
  }
}

/** Builds the simulated path from `from`; `output` is used as the mic, `input` to disconnect it. */
export function buildLoopback(ctx: AudioContext, from: AudioNode, mode: LoopbackMode): { input: AudioNode; output: AudioNode } {
  const delay = ctx.createDelay(1);
  // whole samples: a fractional delay interpolates linearly, which acts as a low-pass filter
  delay.delayTime.value = Math.round(LOOPBACK_DELAY_S * ctx.sampleRate) / ctx.sampleRate;
  from.connect(delay);
  let tail: AudioNode = delay;

  if (mode === 'invert') {
    const g = ctx.createGain();
    g.gain.value = -1;
    tail.connect(g);
    tail = g;
  } else if (mode === 'dist') {
    const shaper = ctx.createWaveShaper();
    const n = 8193;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = x + LOOPBACK_DIST_K * x * x * x;
    }
    shaper.curve = curve;
    shaper.oversample = '4x';
    tail.connect(shaper);
    tail = shaper;
  } else if (mode === 'room') {
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = roomImpulse(ctx);
    tail.connect(conv);
    tail = conv;
  }
  const out = ctx.createGain();
  tail.connect(out);
  return { input: delay, output: out };
}

/** Direct sound plus an exponentially decaying diffuse tail (RT60 = LOOPBACK_RT60). */
function roomImpulse(ctx: AudioContext): AudioBuffer {
  const fs = ctx.sampleRate;
  const len = Math.round(fs * LOOPBACK_RT60 * 1.5);
  const buf = ctx.createBuffer(1, len, fs);
  const d = buf.getChannelData(0);
  d[0] = 1;
  // amplitude decays 60 dB over RT60: exp(-6.91 t / RT60); tail starts after 3 ms
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  const start = Math.round(0.003 * fs);
  for (let i = start; i < len; i++) {
    const t = i / fs;
    d[i] = 0.25 * rand() * Math.exp((-6.9078 * t) / LOOPBACK_RT60);
  }
  return buf;
}
