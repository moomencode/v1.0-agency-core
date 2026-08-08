import { assert, runTests } from './helpers.mjs';
import fs from 'node:fs';
import {
  orcError,
  ORC_CODES,
  classOf,
  failureOf,
  FAILURE_CLASSES
} from '../errors.js';
import {
  campaignIdFor,
  executionIdFor,
  approvalIdFor,
  fingerprint,
  canonicalSpec,
  hex16
} from '../utils.js';
import { backoffMs } from '../workflow/engine.js';
import { sha256 } from '../utils.js';
import { defaultLimits, resolveLimits, isExhausted } from '../limits/budget.js';
import { LockManager } from '../concurrency/lock.js';
import { killSwitch } from '../safety/killswitch.js';
import { classifyError } from '../failures/classifier.js';
import { scratchRoot } from './helpers.mjs';

const root = scratchRoot('unit');

export const unit = {
  'orc codes are stable and unique': () => {
    const values = Object.values(ORC_CODES);
    assert(new Set(values).size === values.length, 'duplicate codes');
    assert(ORC_CODES.STATE_INVALID === 'E_ORC_STATE_INVALID');
    assert(ORC_CODES.KILL_SWITCH === 'E_ORC_KILL_SWITCH');
    assert(FAILURE_CLASSES.includes('BUSINESS'));
    assert(FAILURE_CLASSES.includes('TRANSIENT'));
  },

  'orcError carries code/class/retryable': () => {
    const err = orcError(ORC_CODES.LOCK_CONFLICT, 'locked', { retryable: true });
    assert(err.code === ORC_CODES.LOCK_CONFLICT);
    assert(err.retryable === true);
    const err2 = orcError(ORC_CODES.STATE_INVALID, 'bad', { retryable: false });
    assert(err2.retryable === false);
  },

  'classOf/failureOf map classes': () => {
    assert(classOf(ORC_CODES.BUSINESS_FAILURE) === 'BUSINESS');
    assert(classOf(ORC_CODES.SYSTEM_FAILURE) === 'SYSTEM');
    assert(classOf('E_ORC_UNKNOWN') === 'SYSTEM');
    const f = failureOf(ORC_CODES.TRANSIENT_FAILURE);
    assert(f.class === 'TRANSIENT' && f.retryable === true);
  },

  'classifier: transient/validation/policy/system': () => {
    const t = classifyError(Object.assign(new Error('rate limited'), { code: 'E_TR_RATE_LIMITED' }));
    assert(t.class === 'TRANSIENT' && t.retryable === true);
    const v = classifyError(Object.assign(new Error('bad schema'), { code: 'E_ORC_SCHEMA_INVALID' }));
    assert(v.class === 'VALIDATION' && v.retryable === false);
    const p = classifyError(Object.assign(new Error('budget'), { code: 'E_ORC_LIMITS_REACHED' }));
    assert(p.class === 'POLICY' && p.retryable === false);
    const s = classifyError(Object.assign(new Error('kill'), { code: 'E_ORC_KILL_SWITCH' }));
    assert(s.class === 'SYSTEM');
    const u = classifyError(new Error('plain'));
    assert(u.class === 'SYSTEM');
  },

  'deterministic ids': () => {
    const specA = { name: 'x', discovery: { market: 'Cairo' } };
    const specB = { name: 'x', discovery: { market: 'Cairo' } };
    const specC = { name: 'y', discovery: { market: 'Cairo' } };
    const a1 = campaignIdFor(specA);
    const a2 = campaignIdFor(specB);
    assert(a1 === a2, 'same spec must map to same campaign id');
    assert(a1 !== campaignIdFor(specC), 'different spec must differ');
    assert(/^cmp-[0-9a-f]{16}$/.test(a1), `campaign id shape: ${a1}`);
    const e1 = executionIdFor(a1, 'biz-1', 1);
    const e2 = executionIdFor(a1, 'biz-1', 1);
    assert(e1 === e2);
    assert(/^orc-[0-9a-f]{16}$/.test(e1), `execution id shape: ${e1}`);
    assert(executionIdFor(a1, 'biz-1', 1) !== executionIdFor(a1, 'biz-2', 1));
    const ap1 = approvalIdFor(e1, 'DEPLOY', 'deploy');
    const ap2 = approvalIdFor(e1, 'DEPLOY', 'deploy');
    assert(ap1 === ap2);
    assert(/^apr-[0-9a-f]{16}$/.test(ap1), `approval id shape: ${ap1}`);
  },

  'fingerprint is deterministic and content-sensitive': () => {
    const a = fingerprint({ x: 1, y: [2, 3] });
    const b = fingerprint({ y: [2, 3], x: 1 });
    assert(a === b, 'key order must not matter');
    assert(a !== fingerprint({ x: 1, y: [2, 4] }));
    assert(typeof a === 'string' && a.length === 64);
  },

  'canonicalSpec is stable': () => {
    const spec = { autonomyLevel: 'L4', name: 'n', limits: { maxBusinesses: 6 } };
    const c1 = canonicalSpec(spec);
    const c2 = canonicalSpec({ limits: { maxBusinesses: 6 }, name: 'n', autonomyLevel: 'L4' });
    assert(c1 === c2, 'canonical form must be order-independent');
  },

  'backoff is capped and doubles': () => {
    assert(backoffMs(1) === 200);
    assert(backoffMs(2) === 400);
    assert(backoffMs(3) === 800);
    assert(backoffMs(10) === 5000, 'must cap at 5000');
  },

  'default limits resolve with overrides': () => {
    const def = defaultLimits();
    assert(def.maxBusinesses === 20);
    assert(def.maxConcurrent === 3);
    assert(def.maxRetries === 3);
    const merged = resolveLimits({ maxBusinesses: 5 });
    assert(merged.maxBusinesses === 5);
    assert(merged.maxConcurrent === def.maxConcurrent);
    assert(merged.maxAiCalls === def.maxAiCalls);
    const merged2 = resolveLimits();
    assert(merged2.maxBusinesses === def.maxBusinesses);
  },

  'isExhausted reads reached ledger': () => {
    const ledger = { limits: resolveLimits({ maxDeployments: 1 }), counters: {}, reached: [] };
    assert(isExhausted(ledger) === false);
    ledger.reached.push('maxDeployments');
    assert(isExhausted(ledger) === true);
  },

  'lock manager: acquire/release/conflict/ttl': async () => {
    const locks = new LockManager({ root, ttlMs: 200 });
    const token = locks.acquire('biz-1', 'exec-1');
    assert(token, 'acquire must return a token');
    let conflict = false;
    try {
      locks.acquire('biz-1', 'exec-2');
    } catch (err) {
      conflict = err.code === ORC_CODES.LOCK_CONFLICT;
    }
    assert(conflict, 'second acquire must conflict');
    locks.release('biz-1', 'exec-1');
    const token2 = locks.acquire('biz-1', 'exec-3');
    assert(token2, 'reacquire after release must succeed');
    locks.release('biz-1', 'exec-3');
    locks.acquire('stale-biz', 'exec-a');
    await new Promise((r) => setTimeout(r, 300));
    const re = locks.acquire('stale-biz', 'exec-b');
    assert(re, 'expired ttl must free the lock');
    locks.release('stale-biz', 'exec-b');
  },

  'kill switch: file + env detection': () => {
    const sw = killSwitch({ root });
    assert(sw.isActive() === false);
    sw.activate();
    assert(sw.isActive() === true, 'activate() must arm the switch');
    sw.clear();
    assert(sw.isActive() === false, 'clear() must disarm');
    fs.writeFileSync(`${root}/EMERGENCY_STOP`, 'now');
    const sw2 = killSwitch({ root });
    assert(sw2.isActive() === true, 'EMERGENCY_STOP file must arm the switch');
    sw2.clear();
    assert(killSwitch({ root }).isActive() === false, 'cleared file must not arm');
  },

  'hex16 helper': () => {
    const h = hex16(sha256('anything'));
    assert(/^[0-9a-f]{16}$/.test(h));
    assert(hex16(sha256('anything')) === h);
  }
};

async function main() {
  const ok = await runTests('unit', unit);
  process.exit(ok ? 0 : 1);
}

main();
