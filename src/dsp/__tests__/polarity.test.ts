import { describe, expect, it } from 'vitest';
import { BiquadCascade, rbj } from '../biquad';
import { polarityFromIr, polarityFromPulses, polarityPulse } from '../polarity';

const FS = 48000;

/** A "loudspeaker": 2nd-order high-pass at 80 Hz plus a low-pass at 6 kHz. */
function speaker(x: Float64Array, sign = 1): Float64Array {
  const f = new BiquadCascade([rbj('highpass', 80, FS), rbj('lowpass', 6000, FS)]);
  return Float64Array.from(x, (v) => sign * f.processSample(v));
}

describe('polarity', () => {
  it('reads + / − from an impulse response through a speaker-like filter', () => {
    const d = new Float64Array(4800);
    d[1000] = 1;
    expect(polarityFromIr(speaker(d), FS, 1000).verdict).toBe('+');
    expect(polarityFromIr(speaker(d, -1), FS, 1000).verdict).toBe('−');
    expect(polarityFromIr(speaker(d), FS, 1000).confidence).toBeGreaterThan(0.3);
  });

  it('reads incoming pulse trains and rejects plain noise', () => {
    const pulse = polarityPulse(FS);
    const x = new Float64Array(FS);
    for (let p = 2400; p + pulse.length < x.length; p += FS / 4) x.set(pulse, p);
    expect(polarityFromPulses(speaker(x), FS).verdict).toBe('+');
    expect(polarityFromPulses(speaker(x, -1), FS).verdict).toBe('−');
    let s = 3;
    const noise = Float64Array.from({ length: FS }, () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5));
    const r = polarityFromPulses(noise, FS);
    expect(r.pulses).toBe(false);
    expect(r.verdict).toBe('?');
  });
});
