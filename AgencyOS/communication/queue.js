import { comError, COM_CODES } from './errors.js';
import { createEnvelope } from './message.js';
import { sleep } from '../runtime/utils.js';

class PriorityHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(entry) {
    this.items.push(entry);
    this._bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  _less(a, b) {
    if (a.priority !== b.priority) return a.priority > b.priority;
    return a.seq < b.seq;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this._less(this.items[i], this.items[parent])) {
        [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
        i = parent;
      } else break;
    }
  }

  _bubbleDown(i) {
    const n = this.items.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._less(this.items[l], this.items[smallest])) smallest = l;
      if (r < n && this._less(this.items[r], this.items[smallest])) smallest = r;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}

export class MessageQueue {
  constructor({ name, registry, bus = null, dlq = null, priority = false, ttlMs = 0, maxAttempts = 3, retryDelayMs = 100, timeoutMs = 30000, logger = null }) {
    this.name = name;
    this.registry = registry;
    this.bus = bus;
    this.dlq = dlq;
    this.priority = priority;
    this.ttlMs = ttlMs;
    this.maxAttempts = maxAttempts;
    this.retryDelayMs = retryDelayMs;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.heap = new PriorityHeap();
    this.seq = 0;
    this.stats = { enqueued: 0, delivered: 0, acked: 0, nacked: 0, expired: 0, dead: 0, timeouts: 0, inFlight: 0 };
    this._running = false;
    this._consumers = [];
    this._delayed = new Map();
  }

  async enqueue(type, payload, { priority = 0, ttlMs = 0, meta = {}, topic = null } = {}) {
    this.registry.validatePayload(type, payload);
    const def = this.registry.def(type);
    const message = createEnvelope({
      type,
      topic: topic ?? def.topic,
      payload,
      meta: {
        ...meta,
        priority: this.priority ? priority : 0,
        ttlMs: ttlMs || this.ttlMs || undefined,
        deliveryCount: 0,
        state: 'queued',
        enqueuedAtMs: Date.now()
      },
      registry: this.registry
    });
    this._push(message, message.meta.priority ?? 0);
    this.stats.enqueued++;
    return message;
  }

  _push(message, priority) {
    this.heap.push({ seq: ++this.seq, priority, message });
  }

  _isExpired(message) {
    const ttl = message.meta.ttlMs;
    if (!ttl) return false;
    return Date.now() - message.meta.enqueuedAtMs > ttl;
  }

  consume(handler, { concurrency = 1 } = {}) {
    if (this._running) throw comError(COM_CODES.STATE_ILLEGAL, `queue "${this.name}" already consuming`);
    this._running = true;
    for (let i = 0; i < concurrency; i++) {
      const worker = this._worker(handler);
      this._consumers.push(worker);
    }
    return this;
  }

  async _worker(handler) {
    while (this._running) {
      const entry = this.heap.pop();
      if (!entry) {
        await sleep(10);
        continue;
      }
      const { message } = entry;
      if (this._isExpired(message)) {
        this.stats.expired++;
        await this._reject(message, 'expired', 'expired');
        this.bus?.publish('queue.expired', { queue: this.name, messageId: message.id, reason: 'ttl' }).catch(() => {});
        continue;
      }
      await this._process(handler, message);
    }
  }
  async _process(handler, message) {
    this.stats.delivered++;
    this.stats.inFlight++;
    message.meta.deliveryCount = (message.meta.deliveryCount ?? 0) + 1;
    message.meta.state = 'processing';
    const attempt = message.meta.deliveryCount;
    let settled = false;
    let timer = null;

    const ack = () => {
      if (settled) return;
      settled = true;
      message.meta.state = 'acked';
      this.stats.acked++;
      this.stats.inFlight--;
      this.bus?.publish('queue.acked', { queue: this.name, messageId: message.id, attempt }).catch(() => {});
    };
    const nack = (reason = 'nack', opts = {}) => {
      if (settled) return;
      settled = true;
      message.meta.state = 'nacked';
      this.stats.nacked++;
      this.stats.inFlight--;
      void this._handleFailure(message, reason, attempt, opts);
    };
    const renew = () => {
      if (timer) clearTimeout(timer);
      if (this.timeoutMs > 0) {
        timer = setTimeout(() => {
          if (!settled) {
            this.stats.timeouts++;
            nack('consumer_timeout');
          }
        }, this.timeoutMs);
      }
    };

    const consumerMessage = {
      ...message,
      ack,
      nack,
      renew,
      attempt
    };

    renew();
    try {
      const result = await Promise.resolve(handler(consumerMessage));
      if (!settled) ack();
      void result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      nack(err?.message || 'handler_error');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async _handleFailure(message, reason, attempt, opts) {
    const requeue = opts?.requeue === true;
    if (requeue || attempt < this.maxAttempts) {
      const delay = opts?.delayMs ?? this.retryDelayMs * Math.pow(2, Math.min(attempt - 1, 5));
      const messageId = message.id;
      const redo = () => {
        if (!this._running) return;
        message.meta.state = 'queued';
        message.meta.requeuedAtMs = Date.now();
        this._push(message, message.meta.priority ?? 0);
      };
      if (delay > 0) {
        const t = setTimeout(() => {
          this._delayed.delete(messageId);
          redo();
        }, delay);
        this._delayed.set(messageId, t);
      } else {
        redo();
      }
      this.bus
        ?.publish('queue.nacked', { queue: this.name, messageId: message.id, reason, attempt, requeued: true })
        .catch(() => {});
      return;
    }
    await this._reject(message, reason, 'retries_exhausted', attempt);
  }

  async _reject(message, reason, why, attempt) {
    this.stats.dead++;
    message.meta.state = 'dead';
    if (this.dlq) {
      await this.dlq.reject(message, { reason, from: this.name, why, attempt });
    }
    this.bus
      ?.publish('queue.dead', { queue: this.name, messageId: message.id, reason: why, attempt })
      .catch(() => {});
  }

  pending() {
    return this.heap.size;
  }

  snapshot() {
    return { name: this.name, priority: this.priority, ...this.stats, pending: this.pending() };
  }

  async close() {
    this._running = false;
    await Promise.all(this._consumers);
    this._consumers = [];
    for (const [, t] of this._delayed) clearTimeout(t);
    this._delayed.clear();
  }
}

export class DeadLetterQueue {
  constructor({ bus = null }) {
    this.bus = bus;
    this.records = new Map();
    this.rejects = 0;
    this.requeues = 0;
  }

  async reject(message, { reason, from, why, attempt } = {}) {
    this.rejects++;
    this.records.set(message.id, {
      message,
      reason,
      why,
      from,
      attempt,
      rejectedAt: new Date().toISOString()
    });
  }

  count() {
    return this.records.size;
  }

  list() {
    return [...this.records.values()].map((r) => ({
      messageId: r.message.id,
      type: r.message.type,
      topic: r.message.topic,
      reason: r.reason,
      why: r.why,
      from: r.from,
      attempt: r.attempt,
      rejectedAt: r.rejectedAt
    }));
  }

  async requeue(messageId, { target = null, bus = null } = {}) {
    const record = this.records.get(messageId);
    if (!record) throw comError(COM_CODES.ACK_UNKNOWN, `no dead letter record for "${messageId}"`, { messageId });
    this.records.delete(messageId);
    this.requeues++;
    const message = record.message;
    message.meta.deliveryCount = 0;
    message.meta.state = 'queued';
    message.meta.enqueuedAtMs = Date.now();
    const targetQueue = target ?? record.from;
    const qm = bus ?? this.bus;
    if (qm?.enqueueInto) {
      await qm.enqueueInto(targetQueue, message);
    }
    return message;
  }
}

export class QueueManager {
  constructor({ registry, bus = null, dlq = null }) {
    this.registry = registry;
    this.bus = bus;
    this.queues = new Map();
    this.dlq =
      dlq ??
      new DeadLetterQueue({
        bus: this
      });
  }

  createQueue(name, opts = {}) {
    if (this.queues.has(name)) return this.queues.get(name);
    const queue = new MessageQueue({
      name,
      registry: this.registry,
      bus: this.bus,
      dlq: this.dlq,
      ...opts
    });
    this.queues.set(name, queue);
    return queue;
  }

  get(name) {
    return this.queues.get(name) ?? null;
  }

  list() {
    return [...this.queues.keys()];
  }

  async enqueueInto(queueName, message) {
    const queue = this.queues.get(queueName);
    if (!queue) throw comError(COM_CODES.UNKNOWN_TOPIC, `no queue named "${queueName}"`, { queue: queueName });
    queue._push(message, message.meta.priority ?? 0);
    return message;
  }

  async close() {
    for (const queue of this.queues.values()) await queue.close();
  }
}
