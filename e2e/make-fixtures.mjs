// Writes e2e/fixtures/tone1k.wav: 1 kHz sine at −20 dBFS (AES17), 48 kHz mono 16-bit, 5 s.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
mkdirSync(dir, { recursive: true });
const fs = 48000;
const n = fs * 5;
const amp = 10 ** (-20 / 20);
const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(32767 * amp * Math.sin((2 * Math.PI * 1000 * i) / fs)), i * 2);
const h = Buffer.alloc(44);
h.write('RIFF', 0);
h.writeUInt32LE(36 + data.length, 4);
h.write('WAVEfmt ', 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(1, 22);
h.writeUInt32LE(fs, 24);
h.writeUInt32LE(fs * 2, 28);
h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34);
h.write('data', 36);
h.writeUInt32LE(data.length, 40);
writeFileSync(join(dir, 'tone1k.wav'), Buffer.concat([h, data]));
