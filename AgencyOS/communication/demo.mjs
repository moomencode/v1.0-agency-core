import { CommunicationSystem } from './index.js';

const system = new CommunicationSystem();
const { bus, heartbeat } = system;

console.log('=== AgencyOS Communication demo ===\n');

bus.subscribe('agent.*', (m) => console.log(`[bus] ${m.type} <- ${m.payload.agentId} (run ${m.payload.runId}, step ${m.payload.stepId ?? '-'})`));
bus.subscribe('#', (m) => console.log(`[all] ${m.topic} id=${m.id.slice(0, 8)}`));

await system.publish('agent.started', { agentId: 'lead-hunter', runId: 'run-1', workflowId: 'lead-discovery', stepId: '01' });
await system.publish('agent.completed', { agentId: 'lead-hunter', runId: 'run-1', workflowId: 'lead-discovery', stepId: '01', status: 'completed', durationMs: 12, strategy: 'simulator' });
await system.emit('gate.passed', { runId: 'run-1', workflowId: 'lead-discovery', condition: 'lead.qualityScore >= 60', result: true });

const jobs = system.queue('jobs', { priority: true, maxAttempts: 2, retryDelayMs: 20 });
const results = [];
jobs.consume((m) => {
  const delay = m.meta.delayMs;
  setTimeout(() => {
    console.log(`[queue] job ${m.meta.job} (priority ${m.meta.priority}, attempt ${m.attempt}) done after ${delay}ms`);
    results.push(m.meta.job);
    m.ack();
  }, delay);
});
await jobs.enqueue('agent.started', { agentId: 'worker', runId: 'run-2', workflowId: 'wf', stepId: '01' }, { priority: 10, meta: { job: 'email', delayMs: 60 } });
await jobs.enqueue('agent.started', { agentId: 'worker', runId: 'run-2', workflowId: 'wf', stepId: '01' }, { priority: 90, meta: { job: 'invoice', delayMs: 20 } });
await jobs.enqueue('agent.started', { agentId: 'worker', runId: 'run-2', workflowId: 'wf', stepId: '01' }, { priority: 50, meta: { job: 'report', delayMs: 40 } });

heartbeat.start('demo-agent', { intervalMs: 150 });
heartbeat.watch('demo-agent', { timeoutMs: 600, onMissed: (id) => console.log(`[heartbeat] ${id} MISSED`), onRecovered: (id) => console.log(`[heartbeat] ${id} recovered`) });
const pinger = heartbeat.answerPings();
const alive = await heartbeat.ping('demo-agent', { timeoutMs: 1000 });
console.log(`[heartbeat] ping -> ${alive.status}`);

await new Promise((r) => setTimeout(r, 500));
console.log('\nqueue results:', results.join(', '));
console.log('stats:', JSON.stringify(system.stats(), null, 2));

pinger.unsubscribe();
await system.close();
console.log('\n=== demo done ===');
