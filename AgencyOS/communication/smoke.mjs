import { CommunicationSystem } from './index.js';
import { EventBus } from '../runtime/eventBus.js';
import { COM_CODES } from './errors.js';
import { sleep } from '../runtime/utils.js';

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

const quiet = { info() {}, error() {}, warn() {} };
const system = new CommunicationSystem({ logger: quiet });
const { bus, queue: q, heartbeat } = { bus: system.bus, queue: (n, o) => system.queue(n, o), heartbeat: system.heartbeat };
const system2 = new CommunicationSystem({ logger: quiet });

try {
  assert(system.messageRegistry.typeNames().length >= 25, 'registry has 25+ message types (got ' + system.messageRegistry.typeNames().length + ')');

  const got = [];
  const sub = bus.subscribe('agent.completed', (m) => got.push(m.payload.agentId));
  await bus.publish('agent.completed', { agentId: 'website-builder', runId: 'r1', workflowId: 'wf', status: 'completed', durationMs: 3, strategy: 'simulator' });
  assert(got.length === 1 && got[0] === 'website-builder', 'publish delivers to subscriber');
  sub.unsubscribe();
  assert(bus.countSubscribers() === 0, 'unsubscribe removes subscriber');

  const patterns = [];
  bus.subscribe('agent.*', (m) => patterns.push(m.payload.agentId));
  await bus.publish('agent.started', { agentId: 'qa', runId: 'r2', workflowId: 'wf', stepId: '04' });
  assert(patterns.length === 1 && patterns[0] === 'qa', 'pattern subscription agent.* matches agent.started');

  const emitted = [];
  bus.subscribe('gate.passed', (m) => emitted.push(m.payload.condition));
  await bus.emit('gate.passed', { runId: 'r3', workflowId: 'wf', condition: 'lead.qualityScore >= 60', result: true });
  assert(emitted.length === 1 && emitted[0] === 'lead.qualityScore >= 60', 'emit delivers to subscribers');

  const fanned = [];
  bus.subscribe('document.emitted', (m) => fanned.push(m.payload.name));
  bus.subscribe('#', (m) => fanned.push('#' + m.payload.name));
  await bus.broadcast('document.emitted', { runId: 'r4', workflowId: 'wf', name: 'lead', version: 1, checksum: 'abc' });
  assert(fanned.length === 2, 'broadcast reaches every subscriber (got ' + fanned.length + ')');

  let invalidRejected = false;
  try {
    await bus.publish('heartbeat.beat', { id: 'x' });
  } catch (err) {
    invalidRejected = err.code === COM_CODES.SCHEMA_INVALID;
  }
  assert(invalidRejected, 'invalid payload rejected with E_COM_SCHEMA_INVALID');

  let unknownRejected = false;
  try {
    await bus.publish('no.such.type', {});
  } catch (err) {
    unknownRejected = err.code === COM_CODES.UNKNOWN_TYPE;
  }
  assert(unknownRejected, 'unknown type rejected with E_COM_UNKNOWN_TYPE');

  const order = [];
  await bus.publish('agent.started', { agentId: 'a1', runId: 'r', workflowId: 'w', stepId: '1' }, { meta: { priority: 30 } });
  const asyncDone = [];
  bus.subscribe('agent.started', async (m) => {
    await sleep(20);
    asyncDone.push(m.payload.agentId);
  });
  await bus.publish('agent.started', { agentId: 'async-probe', runId: 'r', workflowId: 'w', stepId: '1' });
  assert(asyncDone.length === 1, 'publish awaits async subscribers (execution acknowledgement)');
  void order;

  const fifo = [];
  const q1 = q('smoke-fifo');
  await q1.enqueue('agent.started', { agentId: 'f1', runId: 'r', workflowId: 'w', stepId: '1' });
  await q1.enqueue('agent.started', { agentId: 'f2', runId: 'r', workflowId: 'w', stepId: '1' });
  await q1.enqueue('agent.started', { agentId: 'f3', runId: 'r', workflowId: 'w', stepId: '1' });
  q1.consume((m) => { fifo.push(m.payload.agentId); m.ack(); });
  await sleep(120);
  assert(JSON.stringify(fifo) === JSON.stringify(['f1', 'f2', 'f3']), 'queue preserves FIFO order (got ' + JSON.stringify(fifo) + ')');
  await q1.close();

  const order2 = [];
  const q2 = q('smoke-priority', { priority: true });
  await q2.enqueue('agent.started', { agentId: 'low', runId: 'r', workflowId: 'w', stepId: '1' }, { priority: 10 });
  await q2.enqueue('agent.started', { agentId: 'high', runId: 'r', workflowId: 'w', stepId: '1' }, { priority: 90 });
  await q2.enqueue('agent.started', { agentId: 'mid', runId: 'r', workflowId: 'w', stepId: '1' }, { priority: 50 });
  q2.consume((m) => { order2.push(m.payload.agentId); m.ack(); });
  await sleep(120);
  assert(JSON.stringify(order2) === JSON.stringify(['high', 'mid', 'low']), 'priority queue orders by priority (got ' + JSON.stringify(order2) + ')');
  await q2.close();

  const attempts = [];
  const q3 = q('smoke-ack', { retryDelayMs: 15 });
  await q3.enqueue('agent.started', { agentId: 'acky', runId: 'r', workflowId: 'w', stepId: '1' });
  q3.consume((m) => {
    attempts.push(m.attempt);
    if (m.attempt === 1) m.nack('try_again');
    else m.ack('done');
  });
  await sleep(200);
  assert(q3.stats.acked === 1 && q3.stats.nacked === 1, 'nack retries then ack completes (attempts ' + JSON.stringify(attempts) + ')');
  await q3.close();

  const q4 = q('smoke-dlq', { maxAttempts: 2, retryDelayMs: 10 });
  await q4.enqueue('agent.started', { agentId: 'doomed', runId: 'r', workflowId: 'w', stepId: '1' });
  q4.consume((m) => m.nack('always_fails'));
  await sleep(200);
  assert(q4.stats.dead === 1 && system.dlq.count() === 1, 'retries exhausted moves message to DLQ');
  const dlqEntry = system.dlq.list()[0];
  assert(dlqEntry && dlqEntry.reason === 'always_fails' && dlqEntry.attempt === 2, 'DLQ records reason and attempt');

  const q5 = q('smoke-ttl', { ttlMs: 60 });
  await q5.enqueue('agent.started', { agentId: 'late', runId: 'r', workflowId: 'w', stepId: '1' });
  await sleep(150);
  q5.consume((m) => m.ack());
  await sleep(80);
  assert(q5.stats.expired === 1, 'TTL expiry sends message to DLQ as expired');
  await q5.close();

  const q6 = q('smoke-timeout', { maxAttempts: 1, timeoutMs: 50, retryDelayMs: 5 });
  await q6.enqueue('agent.started', { agentId: 'slow', runId: 'r', workflowId: 'w', stepId: '1' });
  q6.consume(async (m) => { await sleep(300); m.ack(); });
  await sleep(200);
  assert(q6.stats.timeouts === 1 && q6.stats.dead === 1, 'consumer timeout auto-nacks and dead-letters');
  await q6.close();

  const dlqBefore = system.dlq.count();
  await system.dlq.requeue(dlqEntry.messageId, { bus: system.queues });
  assert(system.dlq.count() === dlqBefore - 1, 'DLQ requeue removes record');

  const beats = [];
  bus.subscribe('heartbeat.beat', (m) => beats.push(m.payload.id));
  heartbeat.start('smoke-probe', { intervalMs: 40 });
  await sleep(150);
  assert(beats.includes('smoke-probe') && beats.length >= 2, 'heartbeat producer sends periodic beats (got ' + beats.length + ')');

  let missedFired = false;
  let missedMessage = false;
  bus.subscribe('heartbeat.missed', (m) => {
    if (m.payload.id === 'smoke-ghost') missedMessage = true;
  });
  heartbeat.watch('smoke-ghost', { timeoutMs: 200, onMissed: () => { missedFired = true; } });
  await sleep(600);
  assert(missedFired && missedMessage, 'heartbeat monitor detects missed producer');

  const pinger = system.heartbeat.answerPings();
  const pingResult = await system.heartbeat.ping('smoke-responder', { timeoutMs: 1500 });
  assert(pingResult && pingResult.status === 'alive', 'heartbeat ping/response round trip');
  pinger.unsubscribe();

  await bus.publish('agent.completed', { agentId: 't', runId: 'r', workflowId: 'w', status: 'completed', durationMs: 1, strategy: 'simulator' });
  assert(system.transport.sent >= 1, 'transport send hook exercised (future distributed routing)');

  const runtimeBus = new EventBus(quiet);
  const bridged = [];
  bus.subscribe('agent.completed', (m) => bridged.push(m.payload));
  system.attachRuntimeEvents(runtimeBus);
  runtimeBus.emitEvent('agent_completed', { agent: 'crm', runId: 'run-x', workflowId: 'wf', stepId: '03', status: 'completed', durationMs: 7, strategy: 'simulator' }, { checksum: 'chk' });
  await sleep(60);
  assert(bridged.length === 1 && bridged[0].agentId === 'crm' && bridged[0].runId === 'run-x', 'runtime events bridge to schema-valid messages');

  const stats = system.stats();
  assert(typeof stats.bus.subscribers === 'number' && Array.isArray(stats.queues) && stats.dlq.count >= 0, 'stats exposes bus, queues, dlq, heartbeat');
  assert(!!system.messageRegistry.def('heartbeat.beat'), 'every message follows schema via registry');

  heartbeat.stopAll();
  await system.close();
  await system2.close();
  await new Promise((r) => setTimeout(r, 50));
  assert(system.heartbeat.producers.size === 0 && system.heartbeat.monitors.size === 0, 'close stops heartbeats and consumers');
} catch (err) {
  fail++;
  failures.push('uncaught: ' + err.stack);
  console.log('FAIL uncaught', err.stack);
}

console.log('');
console.log(`=== COMMUNICATION SMOKE: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) {
  console.log('failures:', failures.join(' | '));
  process.exit(1);
}
