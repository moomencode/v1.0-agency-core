import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Aggregate regression runner (4.7.0). Discovers every test suite in AgencyOS
// (tests/ dirs + module-level smoke/regression suites), runs each in its own
// process, aggregates PASS/FAIL counts and reports per-suite and total rows.
// Usage: node AgencyOS/scripts/regress.mjs [--only <substring>]

const AGENCY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(AGENCY, '..');

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

function discover() {
  const suites = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        walk(full, path.join(rel, entry.name));
      } else if (entry.name.endsWith('.mjs')) {
        const relPath = path.join(rel, entry.name).replace(/\\/g, '/');
        const inTests = relPath.includes('/tests/');
        const isStandalone = /(^|\/)(smoke|regression-\d+)\.mjs$/.test(relPath);
        const skip = /helpers\.mjs$/.test(relPath) || /_debug\.mjs$/.test(relPath) || /demo\.mjs$/.test(relPath);
        if ((inTests || isStandalone) && !skip && !relPath.startsWith('scripts/')) {
          suites.push({ rel: relPath, full });
        }
      }
    }
  };
  walk(AGENCY, 'AgencyOS');
  suites.sort((a, b) => a.rel.localeCompare(b.rel));
  return suites;
}

function runSuite({ rel, full }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [full], { cwd: REPO, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.on('close', (code) => {
      let passed = 0;
      let failed = 0;
      for (const line of out.split('\n')) {
        if (/^(PASS |ok \d)/.test(line)) passed++;
        if (/^(FAIL |not ok \d)/.test(line)) failed++;
      }
      const summaryMatch = out.match(/(\d+) passed, (\d+) failed/) || out.match(/(\d+) PASS, (\d+) FAIL/);
      if (summaryMatch) {
        passed = Math.max(passed, Number(summaryMatch[1]));
        failed = Math.max(failed, Number(summaryMatch[2]));
      }
      resolve({ rel, code, passed, failed });
    });
  });
}

const suites = only ? discover().filter((s) => s.rel.includes(only)) : discover();
console.log(`regress: ${suites.length} suites (${only ? `filter "${only}"` : 'all'})\n`);

let totalPassed = 0;
let totalFailed = 0;
let failedSuites = 0;
const rows = [];
for (const suite of suites) {
  const r = await runSuite(suite);
  totalPassed += r.passed;
  totalFailed += r.failed;
  if (r.code !== 0 || r.failed > 0) failedSuites++;
  rows.push(r);
  console.log(`- ${r.rel}: ${r.passed} passed, ${r.failed} failed (exit ${r.code})`);
}

console.log(`\nregress totals: ${totalPassed} passed, ${totalFailed} failed across ${suites.length} suites (${failedSuites} with failures)`);
if (failedSuites > 0 || totalFailed > 0) process.exitCode = 1;