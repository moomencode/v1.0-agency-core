import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite, readJson, nowIso } from '../../runtime/utils.js';
import { redact } from '../../delivery/security/redaction.js';
import { intError, INT_CODES } from '../errors.js';
import { eventIdFor } from '../ids.js';
import { dateKey, appendNdjson, readNdjson } from '../utils.js';

const SCHEMA = 'https://agency.os/intelligence/event-envelope';

// Event â†’ metric-point mapping (registry keys only; unknown keys are rejected
// at record time by the MetricStore). One event may produce several points.
export function mapEventToPoints(envelope) {
  const { ev, at, correlation = {}, payload = {} } = envelope;
  const corr = (k) => correlation[k];
  const scope = (type, id) => ({ type, id });
  const counter = (metric, value = 1) => ({ metric, value, kind: 'counter' });
  const points = [];
  const push = (metric, p) => {
    if (!metric) return;
    const kind = p.kind || 'counter';
    points.push({
      metric,
      value: p.value !== undefined ? p.value : 1,
      kind,
      ts: at,
      scope: p.scope,
      source: { type: 'event', event: ev, eventId: envelope.eventId },
      correlation
    });
  };

  const campaignId = corr('campaignId');
  const executionId = corr('executionId');
  const businessId = corr('businessId');
  const provider = corr('provider') || payload.provider || null;
  const step = corr('step') || payload.step || null;
  const jobId = corr('jobId') || payload.jobId || null;

  const agency = scope('agency', 'agency');
  const campaign = campaignId ? scope('campaign', campaignId) : null;
  const execution = executionId ? scope('execution', executionId) : null;
  const providerScope = provider ? scope('provider', provider) : null;
  const stepScope = step ? scope('step', `${executionId || '?'}:${step}`) : null;
  const jobScope = jobId ? scope('job', jobId) : null;

  const c = (p, s) => ({ ...p, scope: s });

  switch (ev) {
    case 'brain.lead_discovered': push('agency.discovered', c(counter('agency.discovered'), agency)); break;
    case 'orchestrator.approved': push('agency.approved', c(counter('agency.approved'), agency)); break;
    case 'orchestrator.deployed': {
      push('agency.websitesGenerated', c(counter('agency.websitesGenerated'), agency));
      push('agency.deployed', c(counter('agency.deployed'), agency));
      push('execution.succeeded', execution ? c(counter('execution.succeeded'), execution) : null);
      if (campaign) push('campaign.deployments', c(counter('campaign.deployments'), campaign));
      break;
    }
    case 'orchestrator.execution_started': {
      push('agency.executions', c(counter('agency.executions'), agency));
      break;
    }
    case 'orchestrator.failed': {
      push('agency.failed', c(counter('agency.failed'), agency));
      push('execution.failed', execution ? c(counter('execution.failed'), execution) : null);
      break;
    }
    case 'orchestrator.approval_required': {
      push('agency.escalations', c(counter('agency.escalations'), agency));
      break;
    }
    case 'orchestrator.campaign_started': if (campaign) push('campaign.started', c(counter('campaign.started'), campaign)); break;
    case 'orchestrator.campaign_completed': if (campaign) push('campaign.completed', c(counter('campaign.completed'), campaign)); break;
    case 'orchestrator.campaign_stopped': if (campaign) push('campaign.stopped', c(counter('campaign.stopped'), campaign)); break;
    case 'orchestrator.limits_reached': if (campaign) push('campaign.limitsReached', c(counter('campaign.limitsReached'), campaign)); break;
    case 'orchestrator.step_completed': {
      push('execution.steps', execution ? c(counter('execution.steps'), execution) : null);
      push('step.completed', stepScope ? c(counter('step.completed'), stepScope) : null);
      break;
    }
    case 'orchestrator.step_failed': {
      push('step.failed', stepScope ? c(counter('step.failed'), stepScope) : null);
      break;
    }
    case 'orchestrator.step_retrying': {
      push('execution.retries', execution ? c(counter('execution.retries'), execution) : null);
      push('step.retried', stepScope ? c(counter('step.retried'), stepScope) : null);
      break;
    }
    case 'delivery.deployed':
    case 'delivery.failed':
      // provider.* points are single-writer: owned by the providers job (which
      // reads delivery records â€” delivery events do not carry a provider id).
      break;
    default:
      break;
  }
  return points.filter((p) => p && p.metric);
}

function inferModule(ev) {
  if (ev.startsWith('orchestrator.')) return 'orchestrator';
  if (ev.startsWith('brain.')) return 'brain';
  if (ev.startsWith('delivery.')) return 'delivery';
  if (ev.startsWith('scheduler.')) return 'scheduler';
  if (ev.startsWith('agency.')) return 'agency';
  return 'agency';
}

export function extractCorrelation(meta = {}, payload = {}) {
  const corr = {};
  for (const k of ['campaignId', 'executionId', 'businessId', 'jobId', 'provider', 'step', 'recordId', 'approvalId']) {
    if (meta && meta[k] !== undefined) corr[k] = meta[k];
    else if (payload && payload[k] !== undefined) corr[k] = payload[k];
  }
  return corr;
}

// Best-effort, bounded, idempotent event ingestion. Never throws to producers.
export class EventSink {
  constructor({ root, bus, validator, envelopeSchema, registry, metrics, vault = null, lruCap = 10000, bufferCap = 1000, clock = null, logger = null } = {}) {
    this.root = root;
    this.dir = path.join(root, 'events');
    this.bus = bus;
    this.validator = validator;
    this.envelopeSchema = envelopeSchema;
    this.registry = registry;
    this.metrics = metrics;
    this.vault = vault;
    this.logger = logger;
    this.lruCap = Math.max(100, lruCap);
    this.bufferCap = Math.max(1, bufferCap);
    this.now = clock?.now || (() => new Date());
    this.buffer = [];
    this.lru = new Map();
    this.stats = { received: 0, written: 0, rejected: 0, duplicates: 0, dropped: 0, replayed: 0, lastEventAt: null };
    this.watermarkFile = path.join(this.dir, 'watermark.json');
    this.subscribed = [];
    this.started = false;
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    this._loadWatermark();
  }

  _loadWatermark() {
    const wm = readJson(this.watermarkFile, null);
    this.watermark = wm && typeof wm.file === 'string'
      ? { file: wm.file, lastLine: Number(wm.lastLine) || 0, lastEventId: wm.lastEventId || null }
      : { file: null, lastLine: 0, lastEventId: null };
  }

  _saveWatermark(file, line, eventId) {
    const relative = path.basename(file);
    atomicWrite(this.watermarkFile, JSON.stringify({ file: relative, lastLine: line, lastEventId: eventId, updatedAt: this.now().toISOString() }, null, 2));
    this.watermark = { file: relative, lastLine: line, lastEventId: eventId };
  }

  _eventFile(iso) {
    return path.join(this.dir, `${dateKey(iso)}.ndjson`);
  }

  _buildEnvelope(record) {
    const { event, ts, ...meta } = record;
    const payload = record.detail !== undefined && record.detail !== null ? record.detail : {};
    const module = meta.module || inferModule(event);
    const correlation = extractCorrelation(meta, payload);
    const at = ts || nowIso();
    return {
      schema: SCHEMA,
      ev: event,
      at,
      module,
      eventId: eventIdFor(event, module, at, correlation, payload),
      correlation,
      payload
    };
  }

  handle(record) {
    if (!this.started || !record || !record.event) return;
    this.stats.received++;
    const envelope = this._buildEnvelope(record);
    const { eventId } = envelope;

    if (this.lru.has(eventId)) {
      this.stats.duplicates++;
      return;
    }
    this.lru.set(eventId, true);
    if (this.lru.size > this.lruCap) this.lru.delete(this.lru.keys().next().value);

    if (this.buffer.length >= this.bufferCap) {
      this.stats.dropped++;
      return;
    }
    this.buffer.push(envelope);
    this._flush();
  }

  _flush() {
    const batch = this.buffer;
    this.buffer = [];
    for (const envelope of batch) {
      this._ingest(envelope);
    }
  }

  _ingest(envelope) {
    const check = this.validator.validate(envelope, this.envelopeSchema, { schemaPath: 'intelligence:event-envelope' });
    if (!check.valid) {
      this.stats.rejected++;
      this._audit('envelope_rejected', { ev: envelope.ev, eventId: envelope.eventId, errors: check.errors.slice(0, 3).map((e) => e.message) });
      return;
    }
    envelope.payload = redact(envelope.payload, { vault: this.vault });
    const file = this._eventFile(envelope.at);
    appendNdjson(file, envelope);

    const relative = path.basename(file);
    let lineNo = this.watermark.file === relative ? this.watermark.lastLine + 1 : 1;
    this._saveWatermark(file, lineNo, envelope.eventId);
    this.stats.written++;
    this.stats.lastEventAt = envelope.at;

    try {
      for (const point of mapEventToPoints(envelope)) {
        this.metrics.record(point);
      }
    } catch (err) {
      this._audit('metric_record_failed', { ev: envelope.ev, eventId: envelope.eventId, error: err.message });
    }
  }

  // On restart: any lines past the persisted watermark are re-processed; the
  // deterministic eventId dedupe makes replay idempotent (duplicates dropped).
  _replay() {
    const wm = this.watermark;
    if (!wm.file) return 0;
    const file = path.join(this.dir, wm.file);
    if (!fs.existsSync(file)) {
      this.watermark = { file: null, lastLine: 0, lastEventId: null };
      return 0;
    }
    const lines = readNdjson(file);
    if (lines.length <= wm.lastLine) return 0;
    let replayed = 0;
    for (let i = wm.lastLine; i < lines.length; i++) {
      const envelope = lines[i];
      if (!envelope) continue;
      this.stats.duplicates++;
      if (!this.lru.has(envelope.eventId)) {
        this.lru.set(envelope.eventId, true);
        if (this.lru.size > this.lruCap) this.lru.delete(this.lru.keys().next().value);
        for (const point of mapEventToPoints(envelope)) {
          try {
            this.metrics.record(point);
          } catch {
            /* point-level duplicates are idempotent; never fatal */
          }
        }
        replayed++;
      }
    }
    this._saveWatermark(wm.file, lines.length, lines.length ? lines[lines.length - 1].eventId : wm.lastEventId);
    this.stats.replayed += replayed;
    return replayed;
  }

  _audit(action, meta) {
    if (this.logger && typeof this.logger.info === 'function') {
      try {
        this.logger.info(action, meta, { module: 'intelligence' });
      } catch {
        /* audit is best-effort */
      }
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    this._replay();
    for (const ev of this.registry.events || []) {
      if (!this.bus || typeof this.bus.on !== 'function') break;
      const handler = (record) => {
        try {
          this.handle(record);
        } catch {
          /* the sink never breaks producers */
        }
      };
      this.bus.on(ev, handler);
      this.subscribed.push({ ev, handler });
    }
    return this;
  }

  stop() {
    this.started = false;
    if (this.bus && typeof this.bus.off === 'function') {
      for (const { ev, handler } of this.subscribed) {
        try {
          this.bus.off(ev, handler);
        } catch {
          /* best-effort unsubscribe */
        }
      }
    }
    this.subscribed = [];
    return this;
  }

  statsSnapshot() {
    const wm = this.watermark;
    const wmFile = wm.file ? path.join(this.dir, wm.file) : null;
    return {
      ...this.stats,
      bufferLength: this.buffer.length,
      lruSize: this.lru.size,
      watermark: wmFile ? { file: wm.file, lastLine: wm.lastLine, lastEventId: wm.lastEventId } : null,
      started: this.started
    };
  }
}

export function createEventSink(opts) {
  return new EventSink(opts);
}
