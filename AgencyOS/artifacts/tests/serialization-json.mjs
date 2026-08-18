import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ArtifactSystem } from '../index.js';

const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'artifacts-serialization');
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

const sys = new ArtifactSystem({ root: TEST_ROOT, sweeperMs: 0 });

const payload = { totals: { checks: 3, failed: 0 }, passed: true, provider: 'mock' };

// object content must persist as real JSON, never as the 15-byte coercion
const r1 = sys.create({ name: 'qa-obj', type: 'qa-report', format: 'json', content: payload, projectId: 'biz-a', workflowId: 'delivery', stepId: 'qa', generatedBy: 'test' });
const text1 = sys.manager.readText(r1);
let roundtrip = null;
try {
  roundtrip = JSON.parse(text1);
} catch {
  roundtrip = null;
}
assert(roundtrip !== null && JSON.stringify(roundtrip) === JSON.stringify(payload), 'object content persisted as parsing JSON', text1);
assert(text1 !== '[object Object]' && text1.includes('"checks": 3'), 'no [object Object] coercion in payload', text1);
assert(r1.sizeBytes > 15 && r1.sizeBytes === Buffer.byteLength(text1, 'utf8'), 'record size reflects serialized payload', String(r1.sizeBytes));
assert(sys.manager.verify(r1), 'checksum covers the serialized bytes');

const r2 = sys.create({ name: 'list-obj', type: 'document', format: 'json', content: ['a', { b: 2 }], projectId: 'biz-b', workflowId: 'wf' });
const text2 = sys.manager.readText(r2);
assert(JSON.stringify(JSON.parse(text2)) === JSON.stringify(['a', { b: 2 }]), 'array content persisted as parsing JSON', text2);

// string content must stay byte-identical (existing producers depend on it)
const r3 = sys.create({ name: 'str-json', type: 'document', format: 'json', content: '  {"raw": "yes"}\n', projectId: 'biz-c', workflowId: 'wf' });
assert(sys.manager.readText(r3) === '  {"raw": "yes"}\n', 'string content passthrough byte-identical (json)');
const r4 = sys.create({ name: 'str-md', type: 'report', format: 'markdown', content: '# Title\n\n- a\n- b\n', projectId: 'biz-c', workflowId: 'wf' });
assert(sys.manager.readText(r4) === '# Title\n\n- a\n- b\n', 'string content passthrough byte-identical (markdown)');

// object content in a non-json format must render intentionally, not coerce
const r5 = sys.create({ name: 'obj-md', type: 'report', format: 'markdown', content: { message: 'hello', count: 2 }, projectId: 'biz-d', workflowId: 'wf' });
const text5 = sys.manager.readText(r5);
assert(text5.includes('"message": "hello"') && !text5.includes('[object Object]'), 'object markdown content rendered intentionally', text5);
assert(sys.manager.verify(r5), 'markdown object artifact verifies');

console.log(`\nartifacts/serialization-json: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;