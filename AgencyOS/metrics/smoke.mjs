import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MetricsCollector } from './index.js';
import { metError, MET_CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const STORE = path.join(ROOT, 'storage', 'metrics-smoke');
fs.rmSync(STORE, { recursive: true, force: true });

const PASS = [];
let n = 0;
function assert(cond, label, info = '') {
  n++;
  if (cond) { PASS.push(label); return; }
  throw new Error(`FAIL ${label} ${info}`);
}

const mem = new MetricsCollector();
assert(mem.snapshot().businesses.discovered === 0, 'empty collector starts at zero');
let threw = false;
try { mem.record('nonsense'); } catch (e) { threw = e.code === MET_CODES.INVALID_EVENT; }
assert(threw, 'unknown event throws INVALID_EVENT');

const m = new MetricsCollector({ root: STORE });
m.discovered(3);
m.skipped(1);
m.approved(2);
m.websiteGenerated(1);
m.succeeded(1);
m.retried(2);
m.escalated(1);
let s = m.snapshot();
assert(s.businesses.discovered === 3 && s.businesses.skipped === 1 && s.businesses.approved === 2, 'discovered/skipped/approved counters');
assert(s.businesses.websitesGenerated === 1, 'websites generated');
assert(s.reliability.retryCount === 2 && s.reliability.escalations === 1, 'retries + escalations');
assert(s.reliability.successRate === 100 && s.reliability.failureRate === 0, '100% success');

m.failed(1);
s = m.snapshot();
assert(s.reliability.successRate === 50 && s.reliability.failureRate === 50, '50/50 rates');

m.trackOpportunity(70);
m.trackOpportunity(90);
s = m.snapshot();
assert(s.performance.avgOpportunityScore === 80, 'avg opportunity');
assert(s.performance.estimatedRevenue === 0, 'no revenue yet');
m.trackRevenue(5000);
s = m.snapshot();
assert(s.performance.estimatedRevenue === 5000, 'revenue tracked');

m.trackBuildTime(1000);
m.trackBuildTime(3000);
s = m.snapshot();
assert(s.performance.avgBuildTimeMs === 2000, 'avg build time');

const m2 = new MetricsCollector({ root: STORE });
const s2 = m2.snapshot();
assert(s2.businesses.discovered === 3, 'counters persist across instances');
assert(s2.performance.avgOpportunityScore === 80, 'sums persist across instances');
assert(JSON.stringify(m2.counters) === JSON.stringify(m.counters), 'counters identical');
assert(fs.existsSync(path.join(STORE, 'metrics.json')), 'metrics.json written');

m.succeeded(1);
const m3 = new MetricsCollector({ root: STORE });
assert(m3.snapshot().reliability.successRate === 66.67, 'cumulative rates after reload');
m.reset();
assert(m3.snapshot().businesses.discovered === 3, 'reset only resets caller instance');

const custom = new MetricsCollector({ events: { customEvent: true } });
custom.record('customEvent');
assert(custom.snapshot().counters.customEvent === 1, 'custom events allowed');

console.log(`=== METRICS SMOKE: ${n} PASS, 0 FAIL ===`);
process.exit(0);
