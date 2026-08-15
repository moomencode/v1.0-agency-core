import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ArtifactSystem } from '../index.js';

const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'artifacts-deterministic');
fs.rmSync(TEST_ROOT, { recursive: true, force: true });

let pass = 0;
let fail = 0;
function assert(cond, label, extra = '') {
  if (cond) {
    pass++;
    console.log(`PASS ${label}`);
  } else {
    fail++;
    console.log(`FAIL ${label} ${extra}`);
  }
}

const A = new ArtifactSystem({ root: path.join(TEST_ROOT, 'a'), sweeperMs: 0 });
const B = new ArtifactSystem({ root: path.join(TEST_ROOT, 'b'), sweeperMs: 0 });

const spec = { name: 'insight-report', type: 'report', format: 'json', content: '{"ok":true}', projectId: 'agency', workflowId: 'intelligence', runId: 'run-1' };

// 1 — fixed id pattern
const r1 = A.create(spec);
assert(/^art-[0-9a-f]{16}$/.test(r1.id), 'id has the art-<16 hex> pattern', r1.id);

// 2 — ID-1: identical key+version in a different storage root yields the same id
const r2 = B.create(spec);
assert(r1.id === r2.id, 'id is a pure function of (key, version) across storages', `${r1.id} vs ${r2.id}`);

// 3 — versioning changes the id deterministically
const r3 = A.create({ ...spec, content: '{"ok":false}' });
assert(r3.version === 2 && r1.id !== r3.id, 'new version -> new deterministic id', JSON.stringify({ r1: r1.id, r3: r3.id }));
const r4 = B.create({ ...spec, content: '{"ok":false}' });
assert(r3.id === r4.id, 'v2 ids match across storages');

// 4 — legacy random-uuid records remain readable (dual-read compatibility)
const legacyKey = `${r1.projectId}::${r1.workflowId}::${r1.type}::${r1.slug}`;
A.manager.index.keys[legacyKey].versions.unshift('art-legacy-random-uuid-0000000000000001');
A.manager.index.artifacts['art-legacy-random-uuid-0000000000000001'] = { ...r1, id: 'art-legacy-random-uuid-0000000000000001', version: 0 };
A.manager._saveIndex();
const legacy = A.manager.get('art-legacy-random-uuid-0000000000000001');
assert(legacy && legacy.id === 'art-legacy-random-uuid-0000000000000001', 'legacy id still resolvable via index', JSON.stringify(legacy));

// 5 — cleanup unaffected by deterministic ids
const before = A.manager.stats.removed;
const removed = A.manager.remove(r1.id) && A.manager.remove(r3.id);
assert(removed === true && A.manager.stats.removed === before + 2, 'remove works on deterministic ids');

console.log(`\nartifacts/deterministic-ids: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;