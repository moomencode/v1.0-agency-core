import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readJson } from './utils.js';

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'agencyos-readjson-'));

let passed = 0;
let failed = 0;
const failures = [];
function assert(cond, label, extra = '') {
  if (cond) { passed++; console.log(`PASS ${label}`); }
  else { failed++; failures.push(`${label} ${extra}`); console.log(`FAIL ${label} ${extra}`); }
}

const file = (name) => path.join(TEST_ROOT, name);

// 1. missing file keeps intended default behavior
assert(readJson(file('missing.json'), 'fallback') === 'fallback', 'missing file returns fallback');
assert(readJson(file('missing.json'), null) === null, 'missing file returns null fallback');

// 2. valid JSON remains unchanged
fs.writeFileSync(file('valid.json'), JSON.stringify({ a: 1, b: [2, 3] }));
const parsed = readJson(file('valid.json'), null);
assert(parsed && parsed.a === 1 && parsed.b[1] === 3, 'valid JSON parsed unchanged');

// 3. malformed JSON is observable (no onError -> throws)
fs.writeFileSync(file('malformed.json'), '{oops');
let threw = null;
try { readJson(file('malformed.json'), 'fallback'); } catch (err) { threw = err; }
assert(threw instanceof SyntaxError, 'malformed JSON throws SyntaxError', String(threw));

// 4. malformed JSON with onError -> callback invoked, fallback returned
let seen = null;
const malformedWithHandler = readJson(file('malformed.json'), 'fallback', (err) => { seen = err; });
assert(seen instanceof SyntaxError && malformedWithHandler === 'fallback', 'malformed JSON observable via onError and falls back');

// 5. permission/I-O failure is observable (directory as file)
fs.mkdirSync(file('adir'), { recursive: true });
let ioThrew = null;
try { readJson(file('adir'), null); } catch (err) { ioThrew = err; }
assert(ioThrew !== null && ioThrew.code === 'EISDIR', 'reading a directory surfaces IO error', String(ioThrew && ioThrew.code));

// 6. IO failure with onError -> callback invoked, fallback returned
let ioSeen = null;
const ioHandled = readJson(file('adir'), 'fb', (err) => { ioSeen = err; });
assert(ioSeen !== null && ioSeen.code === 'EISDIR' && ioHandled === 'fb', 'IO failure observable via onError and falls back');

fs.rmSync(TEST_ROOT, { recursive: true, force: true });
console.log(`\n=== RUNTIME READJSON ERRORS: ${passed} PASS, ${failed} FAIL ===`);
if (failures.length) console.log('failures:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);
