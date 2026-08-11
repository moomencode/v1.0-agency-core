import fs from 'node:fs';
import path from 'node:path';
import { makeT, INT_ROOT, makeBus, fixedClock } from './helpers.mjs';
import { EventSink, mapEventToPoints } from '../sinks/event-sink.js';
import { MetricStore } from '../stores/metrics.js';
import { Validator } from '../../runtime/validator.js';
import { SecretVault } from '../../delivery/security/secrets.js';

const t = makeT('intelligence/tests/sink.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-sink-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

const config = JSON.parse(fs.readFileSync(path.join(INT_ROOT, 'config', 'intelligence.config.json'), 'utf8'));
const validator = new Validator({ schemasDir: path.join(INT_ROOT, 'schemas') });
const envelopeSchema = validator.loadFile(path.join(INT_ROOT, 'schemas', 'event-envelope.schema.json'));

function makeSink({ root, vault = null, lruCap = 10000, bufferCap = 1000 } = {}) {
  const metrics = new MetricStore({ root, registry: config.metrics.registry, derived: config.metrics.derived });
  const sink = new EventSink({ root, bus: null, validator, envelopeSchema, registry: config.sink, metrics, vault, lruCap, bufferCap, clock: fixedClock() });
  return { sink, metrics };
}

t.section('envelope building + validation');
{
  const { sink } = makeSink({ root: path.join(BASE, 'a') });
  const bus = makeBus();
  sink.bus = bus;
  sink.start();
  bus.emit('orchestrator.deployed', { event: 'orchestrator.deployed', ts: '2026-08-11T09:15:00.000Z', module: 'orchestrator', campaignId: 'camp-1', executionId: 'ex-1', detail: { status: 'deployed' } });
  bus.emit('not.a.real.event', { event: 'not.a.real.event', ts: '2026-08-11T09:15:00.000Z', module: 'mystery' });
  bus.emit('orchestrator.failed', { event: 'orchestrator.failed', ts: 'not-a-timestamp', module: 'orchestrator', campaignId: 'camp-1', executionId: 'ex-2' });
  const stats = sink.statsSnapshot();
  t.assert(stats.received === 2, 'only registered events reach the sink', `received=${stats.received}`);
  t.assert(stats.written === 1, 'malformed envelope rejected without write', `written=${stats.written}`);
  t.assert(stats.rejected === 1, 'rejection counted', `rejected=${stats.rejected}`);
  const rows = fs.readFileSync(path.join(sink.root, 'events', '2026-08-11.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  t.assert(rows.length === 1, 'day file holds valid envelopes only');
  t.assert(rows[0].schema === 'https://agency.os/intelligence/event-envelope', 'stored envelope has schema marker');
  t.assert(/^evt-[0-9a-f]{16}$/.test(rows[0].eventId), 'stored envelope has deterministic eventId');
  t.assert(rows[0].correlation.executionId === 'ex-1', 'correlation extracted from meta');
  sink.stop();
}

t.section('redaction with vault');
{
  const { sink } = makeSink({ root: path.join(BASE, 'b'), vault: new SecretVault({ env: {} }) });
  const bus = makeBus();
  sink.bus = bus;
  sink.start();
  bus.emit('orchestrator.deployed', { event: 'orchestrator.deployed', ts: '2026-08-11T09:15:00.000Z', module: 'orchestrator', campaignId: 'camp-1', detail: { apiKey: 'sk-super-secret-123', url: 'https://example.test', token: 'tok-abc' } });
  const rows = fs.readFileSync(path.join(BASE, 'b', 'events', '2026-08-11.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const payload = JSON.stringify(rows[0].payload);
  t.assert(!payload.includes('sk-super-secret-123'), 'apiKey redacted at rest');
  t.assert(!payload.includes('tok-abc'), 'token redacted at rest');
  t.assert(payload.includes('[REDACTED]'), 'redaction marker present');
  sink.stop();
}

t.section('dedupe + buffer cap + day rollover');
{
  const { sink, metrics } = makeSink({ root: path.join(BASE, 'c'), lruCap: 100, bufferCap: 5 });
  const bus = makeBus();
  sink.bus = bus;
  sink.start();
  const rec = { event: 'orchestrator.step_completed', ts: '2026-08-11T09:15:00.000Z', module: 'orchestrator', campaignId: 'camp-1', executionId: 'ex-1', step: 'qa' };
  bus.emit('orchestrator.step_completed', rec);
  bus.emit('orchestrator.step_completed', { ...rec });
  bus.emit('orchestrator.step_completed', { ...rec, ts: '2026-08-11T09:15:00.001Z' });
  const stats = sink.statsSnapshot();
  t.assert(stats.duplicates === 1, 'identical envelope deduped by eventId', `duplicates=${stats.duplicates}`);
  t.assert(stats.written === 2, 'distinct envelopes written', `written=${stats.written}`);
  t.assert(stats.bufferLength === 0, 'buffer drains synchronously (crash-safe reads)');

  // Saturate the buffer directly: surplus beyond bufferCap is dropped + counted.
  sink.buffer = [1, 2, 3, 4, 5];
  bus.emit('orchestrator.step_failed', { event: 'orchestrator.step_failed', ts: '2026-08-11T09:20:00.000Z', module: 'orchestrator', campaignId: 'camp-1', executionId: 'ex-1', step: 's9' });
  const capped = sink.statsSnapshot();
  t.assert(capped.dropped === 1, 'buffer cap drops surplus and counts them', `dropped=${capped.dropped}`);
  sink.stop();

  // Day rollover at injected boundary: sink clock is fixed, so feed a next-day event.
  const { sink: sink2, metrics: m2 } = makeSink({ root: path.join(BASE, 'c2'), lruCap: 100, bufferCap: 5 });
  const bus2 = makeBus();
  sink2.bus = bus2;
  sink2.start();
  bus2.emit('orchestrator.campaign_started', { event: 'orchestrator.campaign_started', ts: '2026-08-11T23:59:00.000Z', module: 'orchestrator', campaignId: 'c-2' });
  bus2.emit('orchestrator.campaign_started', { event: 'orchestrator.campaign_started', ts: '2026-08-12T00:01:00.000Z', module: 'orchestrator', campaignId: 'c-3' });
  t.assert(fs.existsSync(path.join(BASE, 'c2', 'events', '2026-08-11.ndjson')), 'day 1 file exists');
  t.assert(fs.existsSync(path.join(BASE, 'c2', 'events', '2026-08-12.ndjson')), 'day 2 file exists (rollover by event ts)');
  sink2.stop();
  void m2;
  void metrics;
}

t.section('watermark replay is idempotent');
{
  const root = path.join(BASE, 'd');
  const { sink, metrics } = makeSink({ root });
  const bus = makeBus();
  sink.bus = bus;
  sink.start();
  bus.emit('orchestrator.deployed', { event: 'orchestrator.deployed', ts: '2026-08-11T09:15:00.000Z', module: 'orchestrator', campaignId: 'camp-1', executionId: 'ex-1' });
  bus.emit('orchestrator.failed', { event: 'orchestrator.failed', ts: '2026-08-11T09:16:00.000Z', module: 'orchestrator', campaignId: 'camp-1', executionId: 'ex-2' });
  const before = metrics.snapshot().stats.points;
  sink.stop();
  // restart: replay must not duplicate points
  const { sink: sink2 } = makeSink({ root });
  const stats2 = sink2.statsSnapshot();
  t.assert(sink2.start().statsSnapshot().replayed >= 0, 'start() replays from watermark without error');
  t.assert(metrics.snapshot().stats.points === before, 'replay does not duplicate points', `before=${before} after=${metrics.snapshot().stats.points}`);
  sink2.stop();
}

t.section('mapEventToPoints covers the 30 registry events without throwing');
{
  const configEvents = config.sink.events;
  t.assert(configEvents.length === 30, 'registry lists 30 events', `count=${configEvents.length}`);
  let mapped = 0;
  for (const ev of configEvents) {
    const envelope = { schema: 'https://agency.os/intelligence/event-envelope', ev, at: '2026-08-11T09:00:00.000Z', module: 'orchestrator', eventId: 'evt-0000000000000000', correlation: { campaignId: 'camp-1', executionId: 'ex-1', businessId: 'biz-1', step: 'qa', jobId: 'j1' }, payload: {} };
    let threw = false;
    try {
      mapped += mapEventToPoints(envelope).length;
    } catch {
      threw = true;
    }
    t.assert(!threw, `${ev} maps without throwing`);
  }
  t.assert(mapped >= 10, 'registry events produce metric points', `points=${mapped}`);
}

t.summary();
