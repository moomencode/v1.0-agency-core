import { assert, runTests } from './helpers.mjs';
import { BoundedPool } from '../concurrency/pool.js';
import { LockManager } from '../concurrency/lock.js';
import { CandidateQueue } from '../campaign/queue.js';
import { ORC_CODES } from '../errors.js';
import { scratchRoot } from './helpers.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const concurrency = {
  'pool runs tasks to completion': async () => {
    const pool = new BoundedPool({ maxConcurrent: 3 });
    const out = await Promise.all([1, 2, 3, 4, 5].map((n) => pool.submit(async () => n * 2)));
    assert(out.join(',') === '2,4,6,8,10');
    assert(pool.active === 0);
    assert(pool.stats().queued === 0);
  },

  'pool respects maxConcurrent': async () => {
    const pool = new BoundedPool({ maxConcurrent: 2, onTaskStart: (n) => (peak = Math.max(peak, n)), onTaskEnd: () => {} });
    let peak = 0;
    pool.onTaskStart = (n) => (peak = Math.max(peak, n));
    const tasks = [];
    for (let i = 0; i < 6; i++) {
      tasks.push(pool.submit(async () => {
        await sleep(40);
        return i;
      }));
    }
    await Promise.all(tasks);
    assert(peak === 2, `peak active must be 2, was ${peak}`);
  },

  'awaitIdle resolves after all tasks settle': async () => {
    const pool = new BoundedPool({ maxConcurrent: 1 });
    let done = 0;
    const tasks = [];
    for (let i = 0; i < 4; i++) {
      tasks.push(pool.submit(async () => {
        await sleep(20);
        done++;
      }));
    }
    await pool.awaitIdle();
    assert(done === 4, `awaitIdle must wait for all 4, done=${done}`);
    await Promise.all(tasks);
  },

  'awaitIdle resolves with queued work pending when not stopped': async () => {
    const pool = new BoundedPool({ maxConcurrent: 2 });
    for (let i = 0; i < 8; i++) pool.submit(async () => { await sleep(10); });
    await pool.awaitIdle();
    assert(pool.active === 0);
    assert(pool.pending() === 0, 'queue must be drained once idle with dispatch active');
  },

  'drain waits for queued tasks': async () => {
    const pool = new BoundedPool({ maxConcurrent: 1 });
    let count = 0;
    for (let i = 0; i < 3; i++) pool.submit(async () => { await sleep(20); count++; });
    await pool.drain();
    assert(count === 3);
  },

  'submit after stop rejects': async () => {
    const pool = new BoundedPool({ maxConcurrent: 1 });
    pool.stopDispatching();
    let rejected = false;
    await pool.submit(async () => 1).catch(() => { rejected = true; });
    assert(rejected, 'submit after stop must reject');
  },

  'stopDispatching prevents new starts but lets actives finish': async () => {
    const pool = new BoundedPool({ maxConcurrent: 1 });
    let finished = 0;
    const p1 = pool.submit(async () => { await sleep(30); finished++; });
    pool.submit(async () => { finished++; });
    await sleep(5);
    pool.stopDispatching();
    await pool.awaitIdle();
    await p1;
    assert(finished === 1, 'only the running task may finish; queued task is not dispatched');
    assert(pool.pending() === 1, 'queued task remains queued after stop');
  },

  'lock manager conflict is retryable-classified': async () => {
    const root = scratchRoot('concurrency');
    const locks = new LockManager({ root, ttlMs: 10000 });
    locks.acquire('biz-x', 'exec-1');
    let err = null;
    try {
      locks.acquire('biz-x', 'exec-2');
    } catch (e) {
      err = e;
    }
    assert(err && err.code === ORC_CODES.LOCK_CONFLICT);
    assert(err.retryable === true);
    locks.release('biz-x', 'exec-1');
  },

  'candidate queue orders by opportunity desc': () => {
    const q = new CandidateQueue({ maxBusinesses: 10 });
    q.add([
      { id: 'a', name: 'A', scores: { opportunity: { value: 40 } } },
      { id: 'b', name: 'B', scores: { opportunity: { value: 90 } } },
      { id: 'c', name: 'C', scores: { opportunity: { value: 60 } } }
    ]);
    assert(q.items().join(',') === 'b,c,a');
    assert(q.dequeue() === 'b');
    assert(q.peek() === 'c');
    assert(q.size() === 2);
  },

  'candidate queue dedupes and caps': () => {
    const q = new CandidateQueue({ maxBusinesses: 2 });
    q.add([
      { id: 'a', name: 'A', scores: { opportunity: { value: 40 } } },
      { id: 'a', name: 'A2', scores: { opportunity: { value: 99 } } },
      { id: 'b', name: 'B', scores: { opportunity: { value: 90 } } },
      { id: 'c', name: 'C', scores: { opportunity: { value: 60 } } }
    ]);
    assert(q.size() === 2, 'cap at maxBusinesses');
    assert(q.items().join(',') === 'b,c');
  },

  'candidate queue restore rebuilds order': () => {
    const q = new CandidateQueue({ maxBusinesses: 5 });
    q.restore(['z', 'a', 'm']);
    assert(q.items().join(',') === 'z,a,m');
    assert(q.size() === 3);
    q.restore([]);
    assert(q.isEmpty());
  }
};

async function main() {
  const ok = await runTests('concurrency', concurrency);
  process.exit(ok ? 0 : 1);
}

main();
