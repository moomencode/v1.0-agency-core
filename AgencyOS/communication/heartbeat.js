import { randomUUID } from 'node:crypto';
import { comError, COM_CODES } from './errors.js';

export class HeartbeatController {
  constructor({ bus, instanceId = 'local-1', logger = null }) {
    this.bus = bus;
    this.instanceId = instanceId;
    this.logger = logger;
    this.producers = new Map();
    this.monitors = new Map();
    this._roundtrip = null;
  }

  start(id, { intervalMs = 2000, status = 'alive' } = {}) {
    if (this.producers.has(id)) throw comError(COM_CODES.DUPLICATE_SUBSCRIPTION, `heartbeat producer "${id}" already running`, { id });
    const handle = { id, intervalMs, status, timer: null, stop: () => this._stopProducer(id) };
    const beat = async () => {
      try {
        await this.bus.publish('heartbeat.beat', { id, instanceId: this.instanceId, status }, { meta: { origin: id } });
      } catch (err) {
        this.logger?.error('heartbeat_beat_failed', { id, error: err.message });
      }
    };
    handle.timer = setInterval(beat, intervalMs);
    handle.timer.unref?.();
    void beat();
    this.producers.set(id, handle);
    return handle;
  }

  _stopProducer(id) {
    const handle = this.producers.get(id);
    if (!handle) return;
    clearInterval(handle.timer);
    this.producers.delete(id);
  }

  watch(id, { timeoutMs = 5000, onMissed = null, onRecovered = null } = {}) {
    const monitor = {
      id,
      timeoutMs,
      onMissed,
      onRecovered,
      lastSeen: Date.now(),
      missed: false,
      timer: null,
      subscription: null,
      stop: () => this._stopWatch(id)
    };
    const beatHandler = (message) => {
      if (message.payload?.id !== id) return;
      const wasMissed = monitor.missed;
      monitor.lastSeen = Date.now();
      monitor.missed = false;
      if (wasMissed) {
        monitor.onRecovered?.(id, monitor.lastSeen);
        this.bus
          ?.publish('heartbeat.missed', { id, instanceId: message.payload.instanceId ?? '', recovered: true }, { meta: { origin: 'heartbeat-monitor' } })
          .catch(() => {});
      }
    };
    monitor.subscription = this.bus.subscribe('heartbeat.beat', beatHandler);
    const check = () => {
      if (Date.now() - monitor.lastSeen > monitor.timeoutMs && !monitor.missed) {
        monitor.missed = true;
        monitor.onMissed?.(id, monitor.timeoutMs);
        this.bus
          ?.publish('heartbeat.missed', { id, instanceId: '', missedForMs: monitor.timeoutMs }, { meta: { origin: 'heartbeat-monitor' } })
          .catch(() => {});
      }
    };
    monitor.timer = setInterval(check, Math.max(500, Math.floor(monitor.timeoutMs / 2)));
    monitor.timer.unref?.();
    this.monitors.set(id, monitor);
    return monitor;
  }

  _stopWatch(id) {
    const monitor = this.monitors.get(id);
    if (!monitor) return;
    clearInterval(monitor.timer);
    monitor.subscription.unsubscribe();
    this.monitors.delete(id);
  }

  async ping(id, { timeoutMs = 3000 } = {}) {
    const requestId = randomUUID();
    const response = new Promise((resolve) => {
      const sub = this.bus.subscribe('heartbeat.response', (message) => {
        if (message.payload?.id === id && message.payload?.requestId === requestId) {
          sub.unsubscribe();
          resolve(message.payload);
        }
      });
      this._roundtrip = { sub, resolve };
    });
    await this.bus.publish(
      'heartbeat.request',
      { id, instanceId: this.instanceId, requestId },
      { meta: { origin: 'heartbeat-ping' } }
    );
    return Promise.race([
      response,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(comError(COM_CODES.HEARTBEAT_STALE, `no heartbeat.response from "${id}" within ${timeoutMs}ms`, { id })),
          timeoutMs
        ).unref?.()
      )
    ]);
  }

  answerPings() {
    return this.bus.subscribe('heartbeat.request', (message) => {
      const { id, instanceId, requestId } = message.payload;
      this.bus
        .publish('heartbeat.response', { id, instanceId, requestId, status: 'alive' }, { meta: { origin: id } })
        .catch(() => {});
    });
  }

  stopAll() {
    for (const id of [...this.producers.keys()]) this._stopProducer(id);
    for (const id of [...this.monitors.keys()]) this._stopWatch(id);
  }
}
