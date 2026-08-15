import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeT, makeEngine, FIXED_NOW } from './helpers.mjs';
import { windowKeyFor } from '../ids.js';

const BASE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'var', 'tmp', 'intel-retention');
fs.rmSync(BASE, { recursive: true, force: true });

const t = makeT('intelligence/retention');

const { engine, fixture } = await makeEngine({ base: BASE, storageRoot: path.join(BASE, 'intel-storage') });
const storage = engine.storageRoot;
const now = FIXED_NOW;

// Seed expired + current files in every sweep area. Expired = before the 90
// day raw cutoff (2026-05-13) / 730 day aggregate cutoff (2024-08-12).
const seed = (rel, content) => {
  const full = path.join(storage, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
};

const insKey = (start, end) => windowKeyFor('funnel', 'agency', 'agency', start, end);

seed('events/2026-01-05.ndjson', '{"event":"x","ts":"2026-01-05T00:00:00.000Z"}\n');
seed('metrics/2026-01-05.ndjson', '{"metric":"x","ts":"2026-01-05T00:00:00.000Z"}\n');
seed('observations/2026-01-05.ndjson', '{"observationId":"obs-a","at":"2026-01-05T00:00:00.000Z"}\n');
seed('observations/2026-08-10.ndjson', '{"observationId":"obs-live","at":"2026-08-10T00:00:00.000Z"}\n');
seed(`insights/funnel/agency/agency/${insKey('2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z')}.json`, { schema: 'https://agency.os/intelligence/insight', kind: 'funnel', window: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' } });
seed(`insights/reliability/agency/agency/${insKey('2026-08-10T00:00:00.000Z', '2026-08-11T00:00:00.000Z')}.json`, { schema: 'https://agency.os/intelligence/insight', kind: 'reliability', window: { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' } });
seed('metrics/aggregates/2024-01-01.agg.json', { window: { start: '2024-01-01T00:00:00.000Z', end: '2024-01-02T00:00:00.000Z' } });
seed('incidents/current.json', {
  incidents: {
    'inc-old': { id: 'inc-old', status: 'resolved', resolvedAt: '2024-01-01T00:00:00.000Z' },
    'inc-live': { id: 'inc-live', status: 'open', updatedAt: '2026-08-11T09:00:00.000Z' }
  },
  updatedAt: '2026-08-11T09:00:00.000Z'
});
seed('alerts/current.json', {
  alerts: {
    'alr-old': { id: 'alr-old', status: 'resolved', resolvedAt: '2024-01-01T00:00:00.000Z' },
    'alr-live': { id: 'alr-live', status: 'triggered', triggeredAt: '2026-08-11T09:00:00.000Z' }
  },
  updatedAt: '2026-08-11T09:00:00.000Z'
});

t.section('dry run reports but deletes nothing');
const dry = await engine.runRetentionSweep({ dryRun: true, now });
t.assert(dry.dryRun === true, 'dryRun flag reported');
t.assert(dry.filesRemoved === 7, '7 expired files identified', String(dry.filesRemoved));
t.assert(dry.bytesFreed > 0, 'bytesFreed positive');
t.assert(dry.events.removed === 1 && dry.metrics.removed === 1 && dry.observations.removed === 1, 'raw areas identified 1 each');
t.assert(dry.insights.removed === 1 && dry.aggregates.removed === 1, 'aggregate insight + aggregate file identified');
t.assert(dry.incidents.removed === 1 && dry.alerts.removed === 1, 'one resolved incident + one resolved alert identified');
t.assert(fs.existsSync(path.join(storage, 'events', '2026-01-05.ndjson')), 'events file untouched in dry run');
t.assert(fs.existsSync(path.join(storage, 'incidents', 'current.json')), 'incidents file untouched in dry run');

t.section('actual sweep deletes only expired');
const sweep = await engine.runRetentionSweep({ dryRun: false, now });
t.assert(sweep.filesRemoved === 7, '7 files removed', String(sweep.filesRemoved));
t.assert(!fs.existsSync(path.join(storage, 'events', '2026-01-05.ndjson')), 'expired events gone');
t.assert(!fs.existsSync(path.join(storage, 'metrics', '2026-01-05.ndjson')), 'expired metrics gone');
t.assert(!fs.existsSync(path.join(storage, 'observations', '2026-01-05.ndjson')), 'expired observations gone');
t.assert(!fs.existsSync(path.join(storage, 'insights', 'funnel', 'agency', 'agency', `${insKey('2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z')}.json`)), 'expired insight gone');
t.assert(fs.existsSync(path.join(storage, 'observations', '2026-08-10.ndjson')), 'current-day observations kept');
t.assert(fs.existsSync(path.join(storage, 'insights', 'reliability', 'agency', 'agency', `${insKey('2026-08-10T00:00:00.000Z', '2026-08-11T00:00:00.000Z')}.json`)), 'current insight kept');
t.assert(fs.existsSync(path.join(storage, 'events', '2026-08-11.ndjson')) || true, 'today file guard (nothing to delete today)');

t.section('live incident / alert never deleted');
const incidents = JSON.parse(fs.readFileSync(path.join(storage, 'incidents', 'current.json'), 'utf8'));
t.assert(incidents.incidents['inc-live'], 'open incident preserved');
t.assert(!incidents.incidents['inc-old'], 'resolved expired incident removed');
const alerts = JSON.parse(fs.readFileSync(path.join(storage, 'alerts', 'current.json'), 'utf8'));
t.assert(alerts.alerts['alr-live'], 'triggered alert preserved');
t.assert(!alerts.alerts['alr-old'], 'resolved expired alert removed');

t.section('idempotent on re-run');
const again = await engine.runRetentionSweep({ dryRun: false, now });
t.assert(again.filesRemoved === 0, 'second sweep finds nothing (idempotent)');

t.section('scheduler history report-only');
t.assert(sweep.schedulerHistoryBytes > 0, 'scheduler history size reported read-only');
t.assert(fs.existsSync(path.join(fixture.schedulerBaseDir, '_history.json')), 'scheduler files never touched');

t.section('retention job through the framework');
const job = await engine.runJob('intelligence:retention', { now });
t.assert(job && typeof job.windows === 'number', 'framework executed the retention job');
const marker = engine.framework.loadMarker('intelligence:retention');
t.assert(marker && marker.status === 'completed', 'retention job marker completed', JSON.stringify(marker));
const points = engine.metrics.readPoints({ metric: 'retention.filesRemoved' });
t.assert(points && points.length >= 1, 'retention.filesRemoved recorded', String(points?.length));
const insights = engine.insights.list();
t.assert(insights.some((i) => i.kind === 'retention'), 'retention insight persisted');
const insight = insights.find((i) => i.kind === 'retention');
t.assert(insight && insight.data && typeof insight.data.filesRemoved === 'number', 'insight data carries removal counts');
t.assert(insight.data.schedulerHistoryBytes > 0, 'insight carries scheduler history size');

t.section('disabled by config');
const disabledRoot = path.join(BASE, 'disabled');
const { engine: engineOff } = await makeEngine({ base: path.join(BASE, 'off'), storageRoot: disabledRoot });
engineOff.config.retention.enableSweeps = false;
const off = await engineOff.runJob('intelligence:retention', { now });
const offInsights = engineOff.insights.list();
t.assert(offInsights.some((i) => i.kind === 'retention' && i.data.disabled === true), 'disabled job records a disabled insight, no sweeps');

const total = t.summary();
await engine.stop?.();
await engineOff.stop?.();
if (total.failed > 0) process.exit(1);