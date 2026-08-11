import fs from 'node:fs';
import path from 'node:path';
import { makeT, makeEngine, makeBus, emitFixtureEvents, fixedClock, FIXED_NOW, CAMPAIGN_ID } from './helpers.mjs';

const t = makeT('intelligence/tests/incidents.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-incidents-' + Date.now());

const bus = makeBus();
const { engine } = await makeEngine({ base: BASE, bus, clock: fixedClock() });
engine.start();
emitFixtureEvents(bus);
await engine.runJobs({ now: FIXED_NOW });
engine.stop();

t.section('trigger mapping');
{
  const incidents = engine.incidents.list();
  const byKind = Object.fromEntries(incidents.map((i) => [i.kind, i]));
  t.assert(Boolean(byKind.step_failed), 'step_failed incident created from step_failed events', JSON.stringify(incidents.map((i) => i.kind)));
  t.assert(Boolean(byKind.provider_error), 'provider_error incident created from delivery.failed');
  t.assert(Boolean(byKind.escalation), 'escalation incident created from approval_required');
  const stepFailed = incidents.filter((i) => i.kind === 'step_failed');
  const critical = stepFailed.filter((i) => i.severity === 'critical');
  t.assert(stepFailed.some((i) => i.scope.type === 'step'), 'warning incident scoped to step');
  t.assert(critical.length === 0, 'no critical step_failed (executions did not fail)');
}

t.section('dedupe + count + evidence cap');
{
  const { IncidentStore } = await import('../stores/incidents.js');
  const { incidentKeyFor } = await import('../ids.js');
  const store = new IncidentStore({ root: path.join(BASE, 'inc'), evidenceCap: 5, clock: fixedClock() });
  const key = incidentKeyFor('execution', 'ex-9', 'step_failed', 'qa');
  store.upsert({ scope: { type: 'execution', id: 'ex-9' }, kind: 'step_failed', severity: 'warning', subject: 'qa', evidence: ['evt-1'] });
  store.upsert({ scope: { type: 'execution', id: 'ex-9' }, kind: 'step_failed', severity: 'warning', subject: 'qa', evidence: ['evt-2'] });
  store.upsert({ scope: { type: 'execution', id: 'ex-9' }, kind: 'step_failed', severity: 'warning', subject: 'qa', evidence: ['evt-3'] });
  const incident = store.get(key);
  t.assert(incident.count === 3, 'sightings increment count', `count=${incident.count}`);
  t.assert(incident.evidence.length === 3, 'evidence accumulated');
  for (let i = 0; i < 10; i++) store.upsert({ scope: { type: 'execution', id: 'ex-9' }, kind: 'step_failed', severity: 'warning', subject: 'qa', evidence: [`evt-${i}`] });
  t.assert(store.get(key).evidence.length === 5, 'evidence capped at evidenceCap', `len=${store.get(key).evidence.length}`);
}

t.section('lifecycle transitions + append-only history');
{
  const { IncidentStore } = await import('../stores/incidents.js');
  const { incidentKeyFor } = await import('../ids.js');
  const root = path.join(BASE, 'inc2');
  const store = new IncidentStore({ root, evidenceCap: 10, clock: fixedClock() });
  const key = incidentKeyFor('execution', 'ex-10', 'step_failed', 'qa');
  store.upsert({ scope: { type: 'execution', id: 'ex-10' }, kind: 'step_failed', severity: 'warning', subject: 'qa' });
  store.ack({ key, by: 'operator' });
  store.resolve({ key, by: 'job', note: 'recovered' });
  store.close({ key, by: 'operator', note: 'postmortem done' });
  const incident = store.get(key);
  t.assert(incident.status === 'closed', 'closed after close()', incident.status);
  t.assert(incident.acknowledgedAt !== null, 'acknowledgedAt recorded');
  t.assert(incident.resolvedAt !== null && incident.resolvedBy === 'job', 'resolvedAt + resolvedBy recorded');
  const history = store.history();
  const events = history.map((h) => h.event);
  t.assert(events.includes('opened') && events.includes('acknowledged') && events.includes('resolved') && events.includes('closed'), 'history records all transitions', events.join(','));
  const lines = fs.readFileSync(path.join(root, 'incidents', 'history.ndjson'), 'utf8').trim().split('\n');
  t.assert(lines.length === 4, 'history is append-only, no rewrite');
  let threw = false;
  try {
    store.resolve({ key: 'inc-key-0000000000000000', by: 'job' });
  } catch {
    threw = true;
  }
  t.assert(threw, 'resolve of unknown key errors');
}

t.section('resolve-on-clear (provider_error + step recovery)');
{
  const incidents = engine.incidents.list();
  const providerError = incidents.find((i) => i.kind === 'provider_error' && i.scope.type === 'provider');
  t.assert(Boolean(providerError), 'provider_error incident tracked');
  const stepFailed = incidents.find((i) => i.kind === 'step_failed' && i.scope.type === 'step');
  t.assert(stepFailed.status === 'resolved', 'step_failed resolved because step_completed followed', `status=${stepFailed.status}`);
  t.assert(providerError.status === 'resolved', 'provider_error resolved because delivery recovered', `status=${providerError.status}`);
  t.assert(providerError.resolvedBy === 'job', 'resolution attributed to the job');
}

t.section('history entries from job runs');
{
  const history = engine.incidents.history({ max: 100 });
  t.assert(history.length >= 2, 'incident transitions persisted to history');
  t.assert(history.every((h) => h.schema === 'https://agency.os/intelligence/incident-history'), 'history records carry schema marker');
}

t.summary();
