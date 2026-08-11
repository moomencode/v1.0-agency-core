import fs from 'node:fs';
import path from 'node:path';
import { makeT, makeEngine, makeBus, emitFixtureEvents, fixedClock, FIXED_NOW, CAMPAIGN_ID, INT_ROOT } from './helpers.mjs';
import { ArtifactManager } from '../../artifacts/manager.js';
import { stableStringify } from '../../runtime/utils.js';

const t = makeT('intelligence/tests/reports.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-reports-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

// Shift the fixture +3h so record times land inside every hourly backfill
// window (see tests/jobs.mjs for the reasoning).
const OFFSET_MS = 3 * 3600000;

const bus = makeBus();
const { engine } = await makeEngine({ base: path.join(BASE, 'e'), bus, clock: fixedClock(), timeOffsetMs: OFFSET_MS });
engine.start();
emitFixtureEvents(bus, { offsetMs: OFFSET_MS });
await engine.runJobs({ now: FIXED_NOW });
engine.stop();

const NOW = FIXED_NOW;

t.section('health report');
{
  const { data, markdown } = engine.buildReport('health', { now: NOW });
  t.assert(data.schema === 'https://agency.os/intelligence/report', 'report schema marker');
  t.assert(data.kind === 'health', 'kind = health');
  t.assert(/^rpt-[0-9a-f]{16}$/.test(data.reportId), 'deterministic report id', data.reportId);
  t.assert(data.generatedAt === NOW, 'generatedAt pinned to provided now');
  t.assert(data.engine && data.engine.metrics && data.engine.sink, 'engine snapshot embedded');
  t.assert(data.engine.sink.written >= 20, 'sink stats real', `written=${data.engine.sink.written}`);
  t.assert(markdown.startsWith('# AgencyOS Intelligence — Health Report'), 'markdown rendered');
  t.assert(markdown.includes('| Open | Closed |') === false, 'markdown uses report tables');
  t.assert(markdown.includes('## Sink'), 'markdown sections present');
}

t.section('incident report');
{
  const { data } = engine.buildReport('incident', { now: NOW });
  t.assert(data.kind === 'incident', 'kind = incident');
  t.assert(typeof data.summary.open === 'number' && typeof data.summary.resolved === 'number', 'incident status summary');
  t.assert(Array.isArray(data.incidents) && data.incidents.length >= 2, 'incidents listed', `count=${data.incidents.length}`);
  t.assert(data.incidents.every((i) => i.incidentId && i.kind && i.scope), 'incident entries complete');
  t.assert(Array.isArray(data.recentHistory), 'history included');
}

t.section('alert report');
{
  const { data } = engine.buildReport('alert', { now: NOW });
  t.assert(data.kind === 'alert', 'kind = alert');
  t.assert(data.rules.length === 6, 'all configured rules listed', `rules=${data.rules.length}`);
  t.assert(data.rules.every((r) => r.ruleId && r.severity), 'rule entries complete');
  t.assert(Array.isArray(data.active) && data.active.length === 0, 'no active alerts in fixture');
}

t.section('campaign report');
{
  const { data, markdown } = engine.buildReport('campaign', { now: NOW, campaignId: CAMPAIGN_ID });
  t.assert(data.kind === 'campaign', 'kind = campaign');
  t.assert(data.campaign.id === CAMPAIGN_ID && data.campaign.name === 'fixture-cairo', 'campaign record embedded');
  t.assert(data.campaign.state === 'COMPLETED', 'campaign state embedded');
  t.assert(Array.isArray(data.funnel) && data.funnel.length >= 1, 'funnel insights attached', `funnel=${data.funnel.length}`);
  t.assert(Array.isArray(data.budget) && data.budget.length >= 1, 'budget insights attached');
  t.assert(Array.isArray(data.reliability) && data.reliability.length >= 1, 'reliability insights attached');
  t.assert(markdown.includes('## Funnel'), 'campaign markdown sections');
  let threw = false;
  try {
    engine.buildReport('campaign', { now: NOW, campaignId: 'ghost-campaign' });
  } catch {
    threw = true;
  }
  t.assert(threw, 'unknown campaign rejected');
}

t.section('operations report');
{
  const { data } = engine.buildReport('operations', { now: NOW });
  t.assert(data.kind === 'operations', 'kind = operations');
  t.assert(data.health && data.health.sink, 'health section attached');
  t.assert(Array.isArray(data.openIncidents), 'open incidents array');
  t.assert(Array.isArray(data.activeAlerts), 'active alerts array');
  t.assert(data.latest.funnel && data.latest.funnel.summary.includes('delivered'), 'latest funnel insight attached', JSON.stringify(data.latest.funnel && data.latest.funnel.summary));
  t.assert(data.latest.reliability && data.latest.scheduler, 'latest reliability + scheduler attached');
}

t.section('deterministic report ids and content');
{
  const a = engine.buildReport('operations', { now: NOW });
  const b = engine.buildReport('operations', { now: NOW });
  t.assert(a.data.reportId === b.data.reportId, 'same now → same report id');
  t.assert(stableStringify(a.data) === stableStringify(b.data), 'same state + now → byte-identical report data');
  const c = engine.buildReport('operations', { now: '2026-08-11T11:00:00.000Z' });
  t.assert(c.data.reportId !== a.data.reportId, 'different now → different report id');
  const h = engine.buildReport('health', { now: NOW });
  t.assert(h.data.reportId !== a.data.reportId, 'different kind → different report id');
  let threw = false;
  try {
    engine.buildReport('mystery', { now: NOW });
  } catch {
    threw = true;
  }
  t.assert(threw, 'unknown report kind rejected');
}

t.section('writeReport persists artifacts + mirrors');
{
  const artifacts = new ArtifactManager({ root: path.join(BASE, 'artifacts'), sweeperMs: 0 });
  const bus2 = makeBus();
  const { engine: e2 } = await makeEngine({ base: path.join(BASE, 'e2'), bus: bus2, clock: fixedClock(), artifacts, timeOffsetMs: OFFSET_MS });
  e2.start();
  emitFixtureEvents(bus2, { offsetMs: OFFSET_MS });
  await e2.runJobs({ now: NOW });
  e2.stop();

  const result = e2.writeReport('health', { now: NOW, runId: 'run-1', projectId: 'agency', workflowId: 'intelligence' });
  t.assert(/^rpt-[0-9a-f]{16}$/.test(result.reportId), 'writeReport returns reportId', result.reportId);
  t.assert(result.json && result.json.id, 'json artifact created');
  t.assert(result.markdown && result.markdown.format === 'markdown', 'markdown artifact created');
  t.assert(result.json.type === 'agency-health', 'kind-specific artifact type', result.json.type);
  t.assert(result.json.projectId === 'agency' && result.json.workflowId === 'intelligence', 'project/workflow recorded');
  t.assert(result.json.runId === 'run-1', 'runId recorded');

  const artifactsBase = path.join(BASE, 'artifacts', 'storage', 'artifacts-engine');
  const index = JSON.parse(fs.readFileSync(path.join(artifactsBase, '_index.json'), 'utf8'));
  t.assert(Object.keys(index.artifacts).length >= 2, 'artifacts indexed', `count=${Object.keys(index.artifacts).length}`);

  const mirrorJson = path.join(e2.storageRoot, 'reports', '2026-08-11', 'health-report.json');
  const mirrorMd = path.join(e2.storageRoot, 'reports', '2026-08-11', 'health-report.md');
  t.assert(fs.existsSync(mirrorJson), 'mirror json written to storage root');
  t.assert(fs.existsSync(mirrorMd), 'mirror markdown written to storage root');
  const mirrored = JSON.parse(fs.readFileSync(mirrorJson, 'utf8'));
  t.assert(mirrored.reportId === result.reportId, 'mirror content matches artifact');
  t.assert(stableStringify(mirrored) === stableStringify(result.json.content ? JSON.parse(result.json.content) : mirrored), 'json artifact content equals mirror');

  const campaignArtifacts = e2.writeReport('campaign', { now: NOW, campaignId: CAMPAIGN_ID });
  t.assert(campaignArtifacts.json.type === 'campaign-report', 'campaign artifact type', campaignArtifacts.json.type);
  const ops = e2.writeReport('operations', { now: NOW });
  t.assert(ops.json.type === 'operations-report', 'operations artifact type');
  const inc = e2.writeReport('incident', { now: NOW });
  t.assert(inc.json.type === 'incident-digest', 'incident artifact type');
  const alr = e2.writeReport('alert', { now: NOW });
  t.assert(alr.json.type === 'alert-digest', 'alert artifact type');
  artifacts.close();
}

t.section('writeReport requires an artifacts manager');
{
  const { engine: bare } = await makeEngine({ base: path.join(BASE, 'bare'), clock: fixedClock() });
  let threw = false;
  try {
    bare.writeReport('health', { now: NOW });
  } catch (err) {
    threw = true;
    t.assert(err.code === 'INT_STORE_ERROR', 'errors with INT_STORE_ERROR', err.message);
  }
  t.assert(threw, 'writeReport without artifacts manager throws');
}

t.section('buildReport works from an engine that never ran jobs');
{
  const { createIntelligence } = await import('../index.js');
  const fresh = createIntelligence({ root: INT_ROOT, storageRoot: path.join(BASE, 'fresh'), clock: fixedClock() });
  const { data } = fresh.buildReport('operations', { now: NOW });
  t.assert(data.kind === 'operations', 'operations report on empty engine');
  t.assert(data.health.sink.written === 0, 'empty sink stats', JSON.stringify(data.health.sink));
  t.assert(data.latest.funnel === null, 'no insights yet');
}

t.summary();
