import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function globalSetup() {
  execFileSync(process.execPath, [fileURLToPath(new URL('./make-fixtures.mjs', import.meta.url))]);
}
