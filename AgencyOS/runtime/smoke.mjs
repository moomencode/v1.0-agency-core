import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Executor } from './executor.js';
import { stableStringify } from './utils.js';

let failures = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures++;
    console.error(`FAIL ${label} ${detail}`);
  }
}

function stripTimestamps(value) {
  if (typeof value === 'string') return value.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/, '<ts>');
  if (Array.isArray(value)) return value.map(stripTimestamps);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value).sort()) out[k] = stripTimestamps(v);
    return out;
  }
  return value;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const runtime = new Executor({ root });
  const stats = runtime.stats();

  assert(stats.registry.workflows.length >= 6, `registry workflows >= 6 (got ${stats.registry.workflows.length})`, JSON.stringify(stats.registry.workflows));
  assert(stats.registry.agents.length >= 9, `registry agents >= 9 (got ${stats.registry.agents.length})`, JSON.stringify(stats.registry.agents));

  const firstWorkflowId = [...stats.registry.workflows].sort()[0];
  const input = { businessName: 'Smoke Test Cafe', city: 'Cairo', country: 'EG' };

  const run1 = await runtime.run(firstWorkflowId, input, { seed: 'smoke-seed', resume: false });
  assert(['completed', 'blocked', 'failed', 'paused'].includes(run1.status), `first run status recorded (${run1.status})`, JSON.stringify(run1));
  assert(run1.summary && typeof run1.summary === 'object', 'summary generated');
  assert(run1.metrics && typeof run1.metrics.agentRuns === 'object', 'metrics generated');
  assert(Object.keys(run1.documents || {}).length >= 1, `documents produced (${Object.keys(run1.documents || {}).length})`, JSON.stringify(Object.keys(run1.documents || {})));

  const run2 = await runtime.run(firstWorkflowId, input, { seed: 'smoke-seed', resume: false });
  const checksum = (docs) =>
    stableStringify(
      Object.fromEntries(Object.entries(docs).map(([k, v]) => [k, stripTimestamps(v)]).sort())
    );
  assert(checksum(run1.documents) === checksum(run2.documents), 'determinism: identical documents for identical seed+input');

  const resumed = await runtime.resume(run1.runId);
  assert(resumed.status === 'completed', 'resume completes cleanly', JSON.stringify(resumed));

  const logFile = path.join(root, 'logs', 'runs', `run-${run1.runId}.ndjson`);
  assert(fs.existsSync(logFile), 'run log file exists', logFile);
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
    assert(lines.length > 0, `log lines written (${lines.length})`);
    const first = JSON.parse(lines[0]);
    assert(first.runId === run1.runId && first.event, 'log lines are structured ndjson');
  }

  const artifactDir = path.join(root, 'storage', 'artifacts', 'runs', run1.runId);
  assert(fs.existsSync(artifactDir) && fs.readdirSync(artifactDir).length >= 1, 'artifacts written', artifactDir);

  const memoryDir = path.join(root, 'storage', 'memory');
  assert(fs.existsSync(memoryDir), 'memory storage exists');
  const memStats = runtime.stats().memory;
  assert(memStats.puts > 0, `memory puts recorded (${memStats.puts})`);

  const cacheStats = runtime.stats().cache;
  assert(cacheStats.writes > 0, `cache writes recorded (${cacheStats.writes})`);

  const pipelineId = stats.registry.workflows.find((id) => id === 'full-pipeline');
  if (pipelineId) {
    const pipe = await runtime.run(pipelineId, input, { seed: 'smoke-seed', resume: false });
    assert(['completed', 'blocked', 'failed', 'paused'].includes(pipe.status), `full-pipeline executed (${pipe.status})`);
    assert(pipe.stages && pipe.stages.length >= 5, `pipeline stages recorded (${pipe.stages?.length || 0})`);
    const unavailable = (pipe.stages || []).filter((s) => s.status === 'unavailable');
    assert(unavailable.length >= 1, `unregistered stages degrade gracefully (${unavailable.length})`);
    const passed = (pipe.stages || []).filter((s) => s.status === 'completed');
    assert(passed.length >= 5, `pipeline stages completed (${passed.length})`);
  } else {
    assert(false, 'full-pipeline registered');
  }

  const all = await runtime.runAll({ seed: 'smoke-seed', resume: false });
  assert(Object.keys(all).length === stats.registry.workflows.length, `runAll executed every registered workflow (${Object.keys(all).length}/${stats.registry.workflows.length})`, JSON.stringify(all));

  const indexFile = path.join(root, 'storage', 'indexes', 'runs.json');
  assert(fs.existsSync(indexFile), 'run index updated');
  if (fs.existsSync(indexFile)) {
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    assert(index.length >= 4, `index has run records (${index.length})`);
  }

  console.log(`\n=== SMOKE RESULT: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('SMOKE CRASHED', err);
  process.exitCode = 1;
});
