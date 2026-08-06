import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Validator } from '../runtime/validator.js';
import { MessageRegistry } from './message.js';
import { MessageBus } from './bus.js';
import { LocalTransport } from './transport.js';
import { QueueManager } from './queue.js';
import { HeartbeatController } from './heartbeat.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

export const EVENTS_TO_TYPES = {
  run_started: 'run.started',
  run_paused: 'run.paused',
  run_completed: 'run.completed',
  run_aborted: 'run.aborted',
  step_started: 'step.started',
  step_completed: 'step.completed',
  stage_unavailable: 'stage.unavailable',
  external_step: 'external.step',
  agent_started: 'agent.started',
  agent_completed: 'agent.completed',
  agent_failed: 'agent.failed',
  validated: 'validated',
  gate_passed: 'gate.passed',
  gate_failed: 'gate.failed',
  retry: 'retry',
  rejected: 'rejected',
  document_emitted: 'document.emitted'
};

function payloadFromEvent(type, meta, detail) {
  const d = detail && typeof detail === 'object' ? detail : {};
  const m = meta || {};
  const payload = {
    runId: m.runId ?? null,
    workflowId: m.workflowId ?? null,
    stepId: m.stepId ?? d.stepId ?? null,
    ...d
  };
  if (m.agent && !payload.agentId) payload.agentId = m.agent;
  if (m.agentId && !payload.agentId) payload.agentId = m.agentId;
  if (m.agent && !payload.agent) payload.agent = m.agent;
  if (d.agent && !payload.agent) payload.agent = d.agent;
  if (m.actor && !payload.actor) payload.actor = m.actor;
  if (m.status && !payload.status) payload.status = m.status;
  if (m.durationMs && !payload.durationMs) payload.durationMs = m.durationMs;
  if (m.strategy && !payload.strategy) payload.strategy = m.strategy;
  if (m.attempts && !payload.attempts) payload.attempts = m.attempts;
  if (m.attempt !== undefined && payload.attempt === undefined) payload.attempt = m.attempt;
  if (m.condition && !payload.condition) payload.condition = m.condition;
  if (m.result !== undefined && payload.result === undefined) payload.result = m.result;
  if (m.code && !payload.code) payload.code = m.code;
  if (m.message && !payload.message) payload.message = m.message;
  if (m.stage && !payload.stage) payload.stage = m.stage;
  return payload;
}

export class CommunicationSystem {
  constructor({ root = ROOT, instanceId = 'local-1', logger = null } = {}) {
    this.root = root;
    this.instanceId = instanceId;
    this.logger = logger;
    const schemasDir = path.join(root, '..', 'schemas');
    this.validator = new Validator({ schemasDir });
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'registry.json'), 'utf8'));
    const envelopeSchema = JSON.parse(fs.readFileSync(path.join(root, registry.envelope), 'utf8'));
    this.messageRegistry = new MessageRegistry({ registry, envelopeSchema, validator: this.validator });
    this.transport = new LocalTransport();
    this.bus = new MessageBus({ registry: this.messageRegistry, transport: this.transport, logger });
    this.queues = new QueueManager({ registry: this.messageRegistry, bus: this.bus });
    this.dlq = this.queues.dlq;
    this.heartbeat = new HeartbeatController({ bus: this.bus, instanceId, logger });
    this.runtimeAttachments = [];
  }

  publish(type, payload, opts = {}) {
    return this.bus.publish(type, payload, { meta: { ...opts.meta, instanceId: this.instanceId }, topic: opts.topic });
  }

  emit(type, payload, opts = {}) {
    return this.bus.emit(type, payload, { meta: { ...opts.meta, instanceId: this.instanceId }, topic: opts.topic });
  }

  broadcast(topic, payload, opts = {}) {
    return this.bus.broadcast(topic, payload, { meta: { ...opts.meta, instanceId: this.instanceId } });
  }

  subscribe(topic, handler, opts = {}) {
    return this.bus.subscribe(topic, handler, opts);
  }

  queue(name, opts = {}) {
    return this.queues.createQueue(name, opts);
  }

  attachRuntimeEvents(runtimeBus, { map = EVENTS_TO_TYPES } = {}) {
    const subscriptions = [];
    for (const [eventName, type] of Object.entries(map)) {
      const sub = runtimeBus.on(eventName, (payload) => {
        const meta = payload ?? {};
        this.publish(type, payloadFromEvent(type, meta, meta.detail), { meta: { origin: 'runtime' } }).catch((err) => {
          this.logger?.error('runtime_event_bridge_failed', { event: eventName, type, error: err.message });
        });
      });
      subscriptions.push({ eventName, type, sub });
    }
    this.runtimeAttachments.push(...subscriptions);
    return subscriptions;
  }

  detachRuntimeEvents() {
    for (const { sub } of this.runtimeAttachments) {
      try {
        sub.unsubscribe?.();
      } catch {
        /* already detached */
      }
    }
    this.runtimeAttachments = [];
  }

  stats() {
    return {
      instanceId: this.instanceId,
      transport: { name: this.transport.name, sent: this.transport.sent },
      bus: {
        subscribers: this.bus.countSubscribers(),
        delivered: this.bus.delivered,
        deliveryFailures: this.bus.deliveryFailures
      },
      messageTypes: this.messageRegistry.typeNames().length,
      queues: this.queues.list().map((name) => this.queues.get(name).snapshot()),
      dlq: { count: this.dlq.count(), rejects: this.dlq.rejects, requeues: this.dlq.requeues },
      heartbeat: {
        producers: [...this.heartbeat.producers.keys()],
        monitors: [...this.heartbeat.monitors.keys()]
      },
      runtimeAttachments: this.runtimeAttachments.length
    };
  }

  async close() {
    this.detachRuntimeEvents();
    this.heartbeat.stopAll();
    await this.queues.close();
    await this.transport.stop();
  }
}

export function createCommunicationSystem(opts = {}) {
  return new CommunicationSystem(opts);
}
