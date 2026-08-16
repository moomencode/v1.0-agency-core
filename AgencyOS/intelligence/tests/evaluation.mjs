import fs from 'node:fs';
import path from 'node:path';
import { stableStringify } from '../../runtime/utils.js';
import { makeT, makeEngine, makeBus, emitFixtureEvents, fixedClock, FIXED_NOW, CAMPAIGN_ID, DEFAULT_POLICY_VERSION, DEFAULT_STRATEGY_VERSION } from './helpers.mjs';
import { ArtifactSystem } from '../../artifacts/index.js';
import { evaluationIdFor } from '../ids.js';

const t = makeT('intelligence/tests/evaluation.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-evaluation-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

const NOW = FIXED_NOW;
const START = '2026-08-10T08:00:00.000Z'; // campaign.createdAt
const WINDOW = { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' };

t.section('golden evaluation report: byte-stable, correct summary');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'golden'), clock: fixedClock() });
  const a = engine.evaluateCampaign({ campaignId: CAMPAIGN_ID, now: NOW });
  const b = engine.evaluateCampaign({ campaignId: CAMPAIGN_ID, now: NOW });
  t.assert(stableStringify(a.report.data) === stableStringify(b.report.data), 'report byte-stable across reruns');
  const d = a.report.data;
  t.assert(d.kind === 'evaluation' && d.reportId === b.report.data.reportId, 'evaluation report kind');
  t.assert(d.evaluationId === evaluationIdFor(CAMPAIGN_ID, START, NOW), 'windowed evaluation id matches pure function', d.evaluationId);
  t.assert(d.campaign.id === CAMPAIGN_ID && d.campaign.state === 'COMPLETED', 'campaign context');
  t.assert(d.stats.reviewed === 6, 'reviewed 6', JSON.stringify(d.stats));
  t.assert(d.stats.approved === 4 && d.stats.rejected === 1 && d.stats.escalated === 1 && d.stats.parked === 0, 'verdict counts', JSON.stringify(d.stats));
  t.assert(d.stats.delivered === 4 && d.stats.deliveredShareOfApproved === 1, 'delivered counts', JSON.stringify(d.stats));
  t.assert(d.stats.policyVersion === DEFAULT_POLICY_VERSION.id, 'summary carries campaign policyVersionRef', d.stats.policyVersion);
  t.assert(d.stats.strategyVersion === DEFAULT_STRATEGY_VERSION.id, 'summary carries campaign strategyVersionRef', d.stats.strategyVersion);
  t.assert(d.rows.length === 6, 'one row per executed business');
  t.assert(d.rows.every((r) => r.policyVersion === DEFAULT_POLICY_VERSION.id), 'every row stamped with the default version');
  t.assert(d.rows[0].verdict === 'APPROVE' && d.rows[4].verdict === 'REJECT' && d.rows[5].verdict === 'ESCALATE', 'rows normalized to brain verdict vocabulary', JSON.stringify(d.rows.map((r) => r.verdict)));
  t.assert(d.rows[0].delivered === true && d.rows[5].delivered === false, 'delivered flags from execution meta');
}

t.section('observations join: rows counted by kind within the window');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'obs'), clock: fixedClock() });
  const receipt = engine.importObservations({
    items: [
      { kind: 'site_up', businessId: 'biz-1', at: '2026-08-10T09:00:00.000Z', executionId: 'ex-1', payload: { url: 'https://biz-1.example.test' } },
      { kind: 'conversion', businessId: 'biz-1', at: '2026-08-10T09:05:00.000Z', executionId: 'ex-1', payload: { amount: 199 } },
      { kind: 'conversion', businessId: 'biz-2', at: '2026-08-10T09:06:00.000Z', executionId: 'ex-2', payload: { amount: 89 } }
    ],
    source: 'manual-review'
  });
  t.assert(receipt.receipt.accepted === 3, 'observations imported', JSON.stringify(receipt));
  const { report } = engine.evaluateCampaign({ campaignId: CAMPAIGN_ID, now: NOW });
  t.assert(report.data.observations.rows === 3, 'three observation rows joined', JSON.stringify(report.data.observations));
  t.assert(report.data.observations.byKind.site_up === 1 && report.data.observations.byKind.conversion === 2, 'counted by kind', JSON.stringify(report.data.observations.byKind));
  // Duplicate re-import of the same rows changes nothing (identity-deduped).
  engine.importObservations({
    items: [
      { kind: 'site_up', businessId: 'biz-1', at: '2026-08-10T09:00:00.000Z', executionId: 'ex-1', payload: { url: 'https://biz-1.example.test' } },
      { kind: 'conversion', businessId: 'biz-1', at: '2026-08-10T09:05:00.000Z', executionId: 'ex-1', payload: { amount: 199 } }
    ],
    source: 'manual-review'
  });
  const again = engine.evaluateCampaign({ campaignId: CAMPAIGN_ID, now: NOW });
  t.assert(again.report.data.observations.rows === 3, 're-import does not change the join', JSON.stringify(again.report.data.observations));
}

t.section('evaluationIdFor is a pure function of scope + window');
{
  t.assert(evaluationIdFor(CAMPAIGN_ID, START, NOW) === evaluationIdFor(CAMPAIGN_ID, START, NOW), 'stable');
  t.assert(evaluationIdFor(CAMPAIGN_ID, START, NOW) !== evaluationIdFor('camp-2', START, NOW), 'changes with campaign');
  t.assert(evaluationIdFor(CAMPAIGN_ID, START, NOW) !== evaluationIdFor(CAMPAIGN_ID, '2026-08-11T00:00:00.000Z', NOW), 'changes with window');
}

t.section('guards: unknown campaign, missing artifacts manager');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'guards'), clock: fixedClock() });
  let code = null;
  try {
    engine.evaluateCampaign({ campaignId: 'camp-zzz', now: NOW });
  } catch (err) {
    code = err.code;
  }
  t.assert(code === 'INT_UNKNOWN_REPORT', 'unknown campaign rejected', `code=${code}`);
  code = null;
  try {
    engine.evaluateCampaign({ campaignId: CAMPAIGN_ID, now: NOW, write: true });
  } catch (err) {
    code = err.code;
  }
  t.assert(code === 'INT_STORE_ERROR', 'write without artifacts manager rejected', `code=${code}`);
}

t.section('write: evaluation-report artifacts + byte-identical mirrors');
{
  const rootA = path.join(BASE, 'artA');
  const rootB = path.join(BASE, 'artB');
  const sysA = new ArtifactSystem({ root: rootA, sweeperMs: 0 });
  const sysB = new ArtifactSystem({ root: rootB, sweeperMs: 0 });
  const { engine } = await makeEngine({ base: path.join(BASE, 'write'), clock: fixedClock(), artifacts: sysA });
  const first = engine.evaluateCampaign({ campaignId: CAMPAIGN_ID, now: NOW, write: true, runId: 'eval-test' });
  const jsonArt = first.written.json;
  t.assert(jsonArt.type === 'evaluation-report' && jsonArt.format === 'json', 'json artifact is an evaluation-report', jsonArt.type);
  t.assert(first.written.markdown.format === 'markdown', 'markdown artifact written');
  const mirror = path.join(engine.storageRoot, 'reports', '2026-08-11', 'evaluation-report.json');
  t.assert(fs.existsSync(mirror), 'mirror json on disk');
  const mirrored = JSON.parse(fs.readFileSync(mirror, 'utf8'));
  t.assert(mirrored.reportId === first.written.reportId, 'mirror content equals artifact payload', JSON.stringify(mirrored).slice(0, 80));
  // A second engine (separate artifact root) over the same fixture produces a
  // byte-identical mirror tree — golden exit criterion for 4.7.1.
  const second = await makeEngine({ base: path.join(BASE, 'write'), clock: fixedClock(), artifacts: sysB, storageRoot: path.join(BASE, 'intel-storage-2') });
  const secondResult = second.engine.evaluateCampaign({ campaignId: CAMPAIGN_ID, now: NOW, write: true, runId: 'eval-test' });
  t.assert(secondResult.written.reportId === first.written.reportId, 'reportId identical across runs', first.written.reportId);
  const mirror2 = fs.readFileSync(path.join(second.engine.storageRoot, 'reports', '2026-08-11', 'evaluation-report.json'), 'utf8');
  t.assert(fs.readFileSync(mirror, 'utf8') === mirror2, 'golden mirror files byte-identical');
  sysB.close();
  sysA.close();
}

t.section('campaign-evaluation job: insight, metrics, idempotent rerun');
{
  const bus = makeBus();
  const { engine } = await makeEngine({ base: path.join(BASE, 'job'), bus, clock: fixedClock() });
  engine.start();
  emitFixtureEvents(bus);
  const first = await engine.runJob('intelligence:campaign_evaluation', { window: WINDOW, now: NOW });
  t.assert(first.name === 'intelligence:campaign_evaluation' && first.windows === 1, 'job executed one window');
  const insight = engine.insights.list('campaign_evaluation', { scopeType: 'agency', scopeId: 'agency' }).find((i) => i.window.start === WINDOW.start);
  t.assert(Boolean(insight), 'campaign_evaluation insight computed');
  t.assert(insight.data.totals.campaigns === 1 && insight.data.totals.reviewed === 6 && insight.data.totals.delivered === 4, 'job totals', JSON.stringify(insight.data.totals));
  const points = engine.metrics.readPoints();
  t.assert(points.some((p) => p.metric === 'evaluation.decisionsReviewed' && p.value === 6), 'evaluation.decisionsReviewed metric', JSON.stringify(points.map((p) => p.metric)));
  t.assert(points.some((p) => p.metric === 'evaluation.delivered' && p.value === 4), 'evaluation.delivered metric');
  const total = points.length;
  const again = await engine.runJob('intelligence:campaign_evaluation', { window: WINDOW, now: NOW });
  t.assert(again.windows === 1, 'explicit-window rerun recomputes the same window');
  t.assert(engine.insights.list('campaign_evaluation', { scopeType: 'agency', scopeId: 'agency' }).length === 1, 'rerun recompute-over-write: one insight remains', JSON.stringify(engine.insights.list('campaign_evaluation', { scopeType: 'agency', scopeId: 'agency' }).map((i) => i.insightId)));
  t.assert(engine.metrics.readPoints().length === total, 'no metric duplication on rerun');
  engine.stop();
}

t.summary();