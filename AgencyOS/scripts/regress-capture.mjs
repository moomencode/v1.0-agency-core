import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression evidence capture (Phase E4).
// Runs the exact same aggregate regression harness as `npm run test:regress`
// and additionally persists its full stdout to a deterministic evidence
// location: AgencyOS/storage/regression-log/regress.log (gitignored)
// The harness itself is untouched — this wrapper only mirrors its output.
// Usage: node AgencyOS/scripts/regress-capture.mjs [--only <substring>]

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const HARNESS = path.join(HERE, 'regress.mjs');
const LOG_DIR = path.join(HERE, '..', 'storage', 'regression-log');
const LOG_FILE = path.join(LOG_DIR, 'regress.log');

const args = process.argv.slice(2);
fs.mkdirSync(LOG_DIR, { recursive: true });

const child = spawn(process.execPath, [HARNESS, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
let out = '';
child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
child.on('close', (code) => {
  fs.writeFileSync(LOG_FILE, out);
  console.log(`\nregress evidence written to AgencyOS/storage/regression-log/regress.log (${out.length} bytes)`);
  process.exitCode = code;
});