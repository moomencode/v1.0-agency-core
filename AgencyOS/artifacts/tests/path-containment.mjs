import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ArtifactSystem } from '../index.js';

const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'artifacts-containment');
fs.rmSync(TEST_ROOT, { recursive: true, force: true });

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, label, extra = '') {
  if (cond) {
    pass++;
    console.log(`PASS ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`FAIL ${label} ${extra}`);
  }
}

const sys = new ArtifactSystem({ root: TEST_ROOT, sweeperMs: 0 });
const base = path.join(TEST_ROOT, 'storage', 'artifacts-engine');
const baseResolved = path.resolve(base);

function contained(relativePath) {
  const full = path.resolve(base, relativePath);
  return full === baseResolved || full.startsWith(baseResolved + path.sep);
}

function expectedSanitized(value) {
  const cleaned = String(value ?? '').replace(/[^a-z0-9._-]/gi, '_').slice(0, 96);
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'unassigned';
  return cleaned;
}

const hostile = ['../escape', '../../escape', '..\\escape', 'C:\\evil', '/etc/x', 'a/../b', 'biz/run/../x', 'biz\u0000x', '.', '..', 'sub/nested/deep'];

for (const id of hostile) {
  const rec = sys.create({ name: `h-${hostile.indexOf(id)}`, type: 'document', format: 'json', content: JSON.stringify({ id }), projectId: id, workflowId: id, runId: id });
  assert(contained(rec.relativePath), `hostile "${id}" must stay inside the artifacts base`, rec.relativePath);
  assert(rec.projectId === expectedSanitized(id), `hostile "${id}" must be sanitized in the record`, rec.projectId);
  const full = path.join(base, rec.relativePath);
  assert(fs.existsSync(full), `sanitized artifact file exists for "${id}"`);
  assert(fs.existsSync(full + '.meta.json'), `sanitized metadata sidecar exists for "${id}"`);
}

assert(fs.readdirSync(path.join(TEST_ROOT, 'storage')).every((e) => e === 'artifacts-engine'), 'no directory escaped the artifacts base');
assert(!fs.existsSync(path.join(TEST_ROOT, 'storage', 'escape')), 'no ../escape directory created outside base');

const dup1 = sys.create({ name: 'dup', type: 'document', format: 'json', content: '{"v":1}', projectId: '../x', workflowId: 'wf' });
const dup2 = sys.create({ name: 'dup', type: 'document', format: 'json', content: '{"v":2}', projectId: '..\\x', workflowId: 'wf' });
assert(dup1.projectId === dup2.projectId, 'hostile variants normalize to one identifier');
assert(dup2.version === dup1.version + 1, 'versioning still increments across normalized hostile ids');

const ok = sys.create({ name: 'acme-report', type: 'document', format: 'json', content: '{"ok":true}', projectId: 'acme-project', workflowId: 'wf-2', runId: 'run-2026-01-01' });
assert(contained(ok.relativePath), 'legit nested path still inside base');
assert(ok.relativePath === path.join('acme-project', 'wf-2', 'document', 'run-2026-01-01', 'acme-report-v1.json'), `legit relativePath preserved, got ${ok.relativePath}`);
assert(ok.projectId === 'acme-project' && ok.workflowId === 'wf-2' && ok.runId === 'run-2026-01-01', 'legit identifiers unchanged');
assert(fs.existsSync(path.join(base, ok.relativePath)), 'legit artifact file written');

const none = sys.manager.list({ projectId: '../../nope' });
assert(none.length === 0, 'list with hostile projectId returns no matches');
assert(sys.manager.latest('acme-project', 'wf-2', 'document', 'acme-report').id === ok.id, 'latest() still resolves legit identifiers');
assert(sys.manager.verify(ok), 'verify still passes for legit artifacts');
assert(JSON.parse(sys.manager.readText(ok)).ok === true, 'readText roundtrip intact');

console.log(`\npath-containment: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
