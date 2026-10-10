/** 32-bit float mono WAV. */
export function wavFloat32(samples: ArrayLike<number>, fs: number): Blob {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true); // IEEE float
  v.setUint16(22, 1, true);
  v.setUint32(24, fs, true);
  v.setUint32(28, fs * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 32, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) v.setFloat32(44 + i * 4, samples[i], true);
  return new Blob([buf], { type: 'audio/wav' });
}
