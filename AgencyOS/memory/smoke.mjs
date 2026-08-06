import { MemorySystem } from './index.js';
import { MEM_CODES } from './errors.js';
import { sleep } from '../runtime/utils.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'memory-smoke');
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

const sys = new MemorySystem({ root: TEST_ROOT, sweeperMs: 0 });
const { engine, store } = { engine: sys.engine, store: sys.store };

try {
  assert(engine.project('p1') && engine.business('b1') && engine.brand() && engine.customer('c1') && engine.agent('qa') && engine.workflow('wf') && engine.execution('r1') && engine.scope('working', 'run:r1'), 'all 8 memory types available');

  await sys.put('business', 'business:cafe-cairo', 'profile', { cuisine: 'koshary', rating: 4.5 });
  const got = sys.get('business', 'business:cafe-cairo', 'profile');
  assert(got.content.cuisine === 'koshary' && got.content.rating === 4.5, 'put/get round trip');
  assert(got.schema === 'https://agency.os/memory/entry', 'entry carries canonical schema');

  const sys2 = new MemorySystem({ root: TEST_ROOT, sweeperMs: 0 });
  const got2 = sys2.get('business', 'business:cafe-cairo', 'profile');
  assert(got2.content.cuisine === 'koshary', 'automatic persistence: second instance reads the same entry');
  sys2.close();

  const r1 = await sys.put('business', 'business:cafe-cairo', 'profile', { cuisine: 'koshary', rating: 4.5 });
  assert(r1.deduped === true, 'identical re-save deduped (no duplicate)');

  const r2 = await sys.put('business', 'business:cafe-cairo', 'profile', { cuisine: 'koshary', rating: 5.0 });
  assert(r2.deduped === false && r2.newVersion === true && r2.entry.version === 2, 'changed content creates a new version');
  assert(sys.get('business', 'business:cafe-cairo', 'profile').content.rating === 5.0, 'latest version wins');

  const r3 = await sys.put('business', 'business:cafe-cairo', 'profile-copy', { cuisine: 'koshary', rating: 5.0 });
  assert(r3.deduped === true && r3.duplicateOf !== undefined, 'same content under another key deduped (no duplicated memories)');

  await sys.put('business', 'business:cafe-cairo', 'menu', { items: 12 });
  await sys.put('business', 'business:cafe-cairo', 'menu', { items: 14 });
  await sys.put('business', 'business:cafe-cairo', 'menu', { items: 16 });
  await sys.put('business', 'business:cafe-cairo', 'menu', { items: 18 });
  await sys.put('business', 'business:cafe-cairo', 'menu', { items: 20 });
  await sys.put('business', 'business:cafe-cairo', 'menu', { items: 22 });
  const history = store.versions('business', 'business:cafe-cairo', 'menu');
  assert(history.length >= 5, 'version history retained (got ' + history.length + ')');
  assert(history.some((v) => v.compressed), 'older versions compressed');
  assert(history[0].content.items === 22 && history[history.length - 1].content.items === 12, 'history preserves order (newest first)');

  const rolled = store.rollback('business', 'business:cafe-cairo', 'menu', 2);
  assert(rolled.content.items === 14 && rolled.version === 7, 'rollback to compressed version restores content (got items ' + rolled.content.items + ', v' + rolled.version + ')');

  const snapId = store.snapshot('smoke-checkpoint', { type: 'business' });
  assert(snapId.startsWith('snap-'), 'snapshot created');
  assert(store.listSnapshots().some((s) => s.id === snapId), 'snapshot listed');

  sys.put('business', 'business:cafe-cairo', 'menu', { items: 99 });
  assert(sys.get('business', 'business:cafe-cairo', 'menu').content.items === 99, 'state mutated for restore test');
  store.restoreSnapshot(snapId);
  const restored = sys.get('business', 'business:cafe-cairo', 'menu');
  assert(restored.content.items !== 99, 'snapshot restore reverts entry (got items ' + restored.content.items + ')');

  const hits = store.search('koshary');
  assert(hits.length >= 1 && hits.some((h) => h.key === 'profile'), 'content search finds memory');
  const keyHits = store.search('menu');
  assert(keyHits.length >= 1 && keyHits[0].key === 'menu', 'search ranks key matches first');

  await engine.project('smoke-project').put('roadmap', { phase: '3.2' });
  const viaWorkflow = engine.workflow('lead-discovery').put('progress', { step: 2 });
  const viaSecondRead = engine.workflow('lead-discovery').get('progress');
  assert(viaSecondRead.content.step === 2 && viaWorkflow.entry.id === viaSecondRead.id, 'cross-workflow reuse: same scope/key reads the same entry');
  assert(engine.project('smoke-project').get('roadmap').content.phase === '3.2', 'project memory shared across workflows');

  const p3 = engine.project('smoke-project');
  const wfA = p3.put('tasks', { done: 1 });
  const wfB = p3.put('tasks', { done: 2 });
  assert(wfB.entry.version === wfA.entry.version + 1, 'updates create versions, not duplicates');

  let secretRejected = false;
  try {
    await sys.put('business', 'business:x', 'apiKey', 'sk-123');
  } catch (err) {
    secretRejected = err.code === MEM_CODES.SECRET_REJECTED;
  }
  assert(secretRejected, 'secret-like keys rejected');

  let badType = false;
  try {
    await sys.put('no-such-type', 'global', 'k', {});
  } catch (err) {
    badType = err.code === MEM_CODES.TYPE_UNKNOWN;
  }
  assert(badType, 'unknown memory type rejected');

  let badScope = false;
  try {
    await sys.put('business', 'project:p9', 'k', {});
  } catch (err) {
    badScope = true;
  }
  assert(badScope, 'scope must match memory type');

  const work = engine.putWorking('run-smoke', 'scratch', { note: 'temp' });
  assert(work.entry.content.note === 'temp', 'working memory stored');
  assert(engine.getWorking('run-smoke', 'scratch').note === 'temp', 'working memory retrieved');
  engine.putWorking('run-smoke', 'hot', { v: 1 }, { ttlMs: 60 });
  await sleep(120);
  let wExpired = false;
  try {
    engine.getWorking('run-smoke', 'hot');
  } catch (err) {
    wExpired = err.code === MEM_CODES.ENTRY_NOT_FOUND;
  }
  assert(wExpired, 'working memory TTL expiry');
  assert(engine.endWorking('run-smoke') >= 1, 'endWorking clears run working memory');

  const ttlKey = 'ephemeral';
  await sys.put('business', 'business:ttl', ttlKey, { x: 1 }, { ttlMs: 80 });
  assert(sys.get('business', 'business:ttl', ttlKey), 'entry present before TTL');
  await sleep(150);
  let expired = false;
  try {
    sys.get('business', 'business:ttl', ttlKey);
  } catch (err) {
    expired = err.code === MEM_CODES.ENTRY_NOT_FOUND && err.meta?.expired === true;
  }
  assert(expired, 'expiration: get treats expired entry as absent');
  assert(sys.exists('business', 'business:ttl', ttlKey) === false, 'exists() reflects expiration');

  assert(engine.forget('business', 'business:cafe-cairo', 'profile') === true, 'forget removes entry');
  assert(engine.forget('business', 'business:cafe-cairo', 'profile') === false, 'forget on missing entry returns false');
  assert(store.search('koshary').every((h) => h.key !== 'profile'), 'forgotten entry leaves the index');

  const stats = sys.stats();
  assert(stats.types.length === 8 && stats.store.deduped > 0 && Array.isArray(stats.snapshots), 'stats exposes types, dedupe counters, snapshots');

  sys.close();
  await sys2.close?.();
  await sleep(50);
  assert(true, 'close stops sweeper and store');
} catch (err) {
  fail++;
  failures.push('uncaught: ' + err.stack);
  console.log('FAIL uncaught', err.stack);
}

console.log('');
console.log(`=== MEMORY SMOKE: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) {
  console.log('failures:', failures.join(' | '));
  process.exit(1);
}
