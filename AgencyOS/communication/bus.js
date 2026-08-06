import { comError, COM_CODES } from './errors.js';
import { createEnvelope } from './message.js';

function matchTopic(pattern, topic) {
  if (pattern === '#') return true;
  const p = pattern.split('.');
  const t = topic.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '#') return true;
    if (p[i] === '*') {
      if (i === p.length - 1) return t.length === p.length;
      continue;
    }
    if (p[i] !== t[i]) return false;
  }
  return t.length === p.length;
}

export class MessageBus {
  constructor({ registry, transport = null, logger = null }) {
    this.registry = registry;
    this.transport = transport;
    this.logger = logger;
    this.subscribers = [];
    this.remoteHandler = null;
    this.delivered = 0;
    this.deliveryFailures = 0;
  }

  countSubscribers() {
    return this.subscribers.length;
  }

  subscribe(topic, handler, { timeoutMs = 0, once = false } = {}) {
    if (typeof handler !== 'function') throw new TypeError('subscribe requires a handler function');
    const sub = { id: `sub-${this.subscribers.length + 1}`, topic, handler, timeoutMs, once, active: true };
    this.subscribers.push(sub);
    return {
      topic,
      id: sub.id,
      unsubscribe: () => {
        sub.active = false;
        const i = this.subscribers.indexOf(sub);
        if (i >= 0) this.subscribers.splice(i, 1);
      }
    };
  }

  matchSubscriptions(topic) {
    return this.subscribers.filter((s) => s.active && matchTopic(s.topic, topic));
  }

  async _deliverTo(sub, message) {
    if (sub.timeoutMs > 0) {
      let timer;
      try {
        await Promise.race([
          Promise.resolve(sub.handler(message)),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(comError(COM_CODES.DELIVERY_TIMEOUT, `subscriber ${sub.id} exceeded ${sub.timeoutMs}ms`)),
              sub.timeoutMs
            );
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    } else {
      await Promise.resolve(sub.handler(message));
    }
    this.delivered++;
    if (sub.once) sub.active = false;
  }

  async dispatch(message) {
    const matches = this.matchSubscriptions(message.topic);
    if (matches.length === 0) return { delivered: 0, failures: 0, subscribers: 0 };
    const results = await Promise.allSettled(
      matches.map((sub) =>
        this._deliverTo(sub, message).catch((err) => {
          this.deliveryFailures++;
          this.logger?.error('delivery_failed', { topic: message.topic, subscriber: sub.id, error: err.message });
          throw err;
        })
      )
    );
    const failures = results.filter((r) => r.status === 'rejected').length;
    return { delivered: matches.length - failures, failures, subscribers: matches.length };
  }

  async publish(type, payload, { meta = {}, topic = null } = {}) {
    const def = this.registry.def(type);
    this.registry.validatePayload(type, payload);
    const message = createEnvelope({
      type,
      topic: topic ?? def.topic,
      payload,
      meta,
      registry: this.registry
    });
    if (this.transport) {
      await this.transport.send({ message, topic: message.topic });
    }
    const local = await this.dispatch(message);
    return {
      message,
      delivered: local.delivered,
      failures: local.failures,
      subscribers: local.subscribers,
      transported: !!this.transport
    };
  }

  async emit(type, payload, { meta = {}, topic = null } = {}) {
    const def = this.registry.def(type);
    this.registry.validatePayload(type, payload);
    const message = createEnvelope({
      type,
      topic: topic ?? def.topic,
      payload,
      meta,
      registry: this.registry
    });
    return this.dispatch(message);
  }

  async broadcast(topic, payload, { meta = {} } = {}) {
    if (!this.registry.registry.types[topic]) {
      throw comError(COM_CODES.UNKNOWN_TOPIC, `no message type registered for broadcast topic "${topic}"`, { topic });
    }
    this.registry.validatePayload(topic, payload);
    const message = createEnvelope({ type: topic, topic, payload, meta, registry: this.registry });
    const results = await Promise.allSettled(this.subscribers.map((sub) => this._deliverTo(sub, message)));
    const failures = results.filter((r) => r.status === 'rejected').length;
    return { message, delivered: this.subscribers.length - failures, failures, subscribers: this.subscribers.length };
  }

  onRemote(handler) {
    this.remoteHandler = handler;
  }

  async receiveRemote(record) {
    if (!this.remoteHandler) {
      await this.dispatch(record.message);
      return;
    }
    await this.remoteHandler(record);
  }
}
