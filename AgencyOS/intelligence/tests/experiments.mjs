import fs from 'node:fs';
import path from 'node:path';
import { stableStringify } from '../../runtime/utils.js';
import { makeT, makeEngine, fixedClock, FIXED_NOW, CAMPAIGN_ID, INT_ROOT, DEFAULT_POLICY_SET, DEFAULT_POLICY_VERSION, DEFAULT_STRATEGY_SET, DEFAULT_STRATEGY_VERSION, STRICT_POLICY_SET, STRICT_POLICY_VERSION } from './helpers.mjs';
import { ArtifactSystem } from '../../artifacts/index.js';
import { materializeVersion } from '../../decision-engine/index.js';
import { experimentIdFor } from '../ids.js';
import { runCompareExperiment } from '../experiments/experiment.js';
import { EXM_CODES } from '../experiments/errors.js';

const t = makeT('intelligence/tests/experiments.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-experiments-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

const NOW = FIXED_NOW;
const WINDOW = { start: '2026-08-10T00:00:00.000Z', end: '2026-08-11T00:00:00.000Z' };
const SPEC = {
  name: 'fixture-strict-vs-default',
  basePolicyVersion: DEFAULT_POLICY_VERSION.id,
  altPolicyVersion: STRICT_POLICY_VERSION.id,
  scope: { type: 'campaign', campaignId: CAMPAIGN_ID },
  maxDecisions: 100
};

t.section('materializeVersion: pure content-addressed identity');
{
  t.assert(DEFAULT_POLICY_VERSION.id === materializeVersion(DEFAULT_POLICY_SET).id, 'default id stable');
  t.assert(DEFAULT_POLICY_VERSION.id !== STRICT_POLICY_VERSION.id, 'strict set differs');
  t.assert(DEFAULT_POLICY_VERSION.count === 8 && STRICT_POLICY_VERSION.count === 8, 'counts', `${DEFAULT_POLICY_VERSION.count}`);
  const mutated = { version: 1, policies: DEFAULT_POLICY_SET.policies.map((p) => (p.id === 'minOpportunity' ? { ...p, value: 95 } : p)) };
  t.assert(materializeVersion(mutated).id !== DEFAULT_POLICY_VERSION.id, 'value change changes the version');
  const strategies = materializeVersion(DEFAULT_STRATEGY_SET);
  t.assert(strategies.id === DEFAULT_STRATEGY_VERSION.id && strategies.count === 3, 'strategy set versioned the same way');
  t.assert(DEFAULT_POLICY_VERSION.id.startsWith('ver-') && DEFAULT_POLICY_VERSION.sha256.length === 64, 'id/sha256 shape');
}

t.section('experiment registry: brain defaults + strict set registered');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'registry'), clock: fixedClock() });
  const registry = engine.experiments.registry;
  t.assert(Boolean(registry[DEFAULT_POLICY_VERSION.id]) && registry[DEFAULT_POLICY_VERSION.id].policies.length === 8, 'default set registered under its version id');
  t.assert(Boolean(registry[STRICT_POLICY_VERSION.id]) && registry[STRICT_POLICY_VERSION.id].policies.length === 8, 'strict set registered');
  t.assert(engine.experiments.defaults === DEFAULT_POLICY_VERSION.id, 'defaults resolved to the brain baseline');
  t.assert(engine.snapshot().experiments.sets === 2, 'snapshot surfaces the registry', JSON.stringify(engine.snapshot().experiments));
}

t.section('brain stamps agree with the experiment baseline');
{
  const { Brain } = await import('../../brain/index.js');
  const brain = new Brain();
  const stamp = brain.versionStamp();
  t.assert(stamp.policyVersion.id === DEFAULT_POLICY_VERSION.id, 'brain policy stamp === default version id', stamp.policyVersion.id);
  t.assert(stamp.strategyVersion.id === DEFAULT_STRATEGY_VERSION.id, 'brain strategy stamp === default strategy id', stamp.strategyVersion.id);
  const result = await brain.runBusiness({ id: 'biz-stamp-1', name: 'Stamp Test', category: 'retail', website: { exists: false }, scores: { opportunity: { value: 92 }, business: { value: 60 } }, reviews: 40, phone: '0512000002', email: 'b@example.test' }, { emit: false });
  t.assert(result.decision.policyVersion.id === DEFAULT_POLICY_VERSION.id, 'runBusiness decision stamped');
  t.assert(result.decision.strategyVersion.id === DEFAULT_STRATEGY_VERSION.id, 'runBusiness decision carries the strategy stamp');
  t.assert(result.decision.decisionId.startsWith('dec-'), 'decisionId shape intact');
}

t.section('compare experiment: 6 evaluated, 5 flips under strict set');
{
  const sys = new ArtifactSystem({ root: path.join(BASE, 'art-exp'), sweeperMs: 0 });
  const { engine } = await makeEngine({ base: path.join(BASE, 'run'), clock: fixedClock(), artifacts: sys });
  const { result, report, written } = engine.compareExperiment(SPEC, { now: NOW });
  t.assert(result.experimentId === experimentIdFor(SPEC.name, SPEC.basePolicyVersion, SPEC.altPolicyVersion, CAMPAIGN_ID), 'experimentId matches pure function', result.experimentId);
  t.assert(result.summary.evaluated === 6, 'all executions re-run', JSON.stringify(result.summary));
  t.assert(result.summary.flipped === 5, '4 approves + 1 escalate flip under strict', JSON.stringify(result.summary));
  t.assert(result.summary.flipRate === 0.83, 'flipRate 5/6', String(result.summary.flipRate));
  t.assert(stableStringify(result.summary.base) === stableStringify({ APPROVE: 4, REJECT: 1, ESCALATE: 1, PARK: 0 }), 'base verdicts from stored records', JSON.stringify(result.summary.base));
  t.assert(result.summary.alt.REJECT === 6, 'alt blocks everything', JSON.stringify(result.summary.alt));
  t.assert(result.unversioned === 0 && result.skipped === 0, 'full fixture evaluated', JSON.stringify({ unversioned: result.unversioned, skipped: result.skipped }));
  const approved = result.decisions.filter((d) => d.baseVerdict === 'APPROVE');
  t.assert(approved.length === 4 && approved.every((d) => d.flip && d.altVerdict === 'REJECT'), 'base APPROVE → alt REJECT');
  const escalated = result.decisions.find((d) => d.baseVerdict === 'ESCALATE');
  t.assert(escalated && escalated.flip === true && escalated.altVerdict === 'REJECT', 'base ESCALATE → alt REJECT');
  const rejected = result.decisions.find((d) => d.baseVerdict === 'REJECT');
  t.assert(rejected && rejected.flip === false, 'already REJECT does not flip');
  t.assert(altPolicyFailures(result).every((p) => p.altPolicyFailure === 'fail'), 'alt re-runs failed the strict set', JSON.stringify(altPolicyFailures(result)));
  t.assert(report.data.kind === 'experiment' && report.data.experimentId === result.experimentId, 'report wired to result');
  t.assert(written.json.type === 'experiment-report', 'experiment-report artifact written');
  const mirror = path.join(engine.storageRoot, 'reports', '2026-08-11', 'experiment-report.json');
  t.assert(fs.existsSync(mirror) && JSON.parse(fs.readFileSync(mirror, 'utf8')).experimentId === result.experimentId, 'mirror written');
  t.assert(report.data.decisions.every((d) => !d.createdAt), 'report rows carry no wall clock');
  sys.close();
}

t.section('experiment determinism: byte-stable reports across reruns');
{
  const rootA = path.join(BASE, 'art-det-a');
  const rootB = path.join(BASE, 'art-det-b');
  const sysA = new ArtifactSystem({ root: rootA, sweeperMs: 0 });
  const sysB = new ArtifactSystem({ root: rootB, sweeperMs: 0 });
  const first = await makeEngine({ base: path.join(BASE, 'det'), clock: fixedClock(), artifacts: sysA });
  const second = await makeEngine({ base: path.join(BASE, 'det'), clock: fixedClock(), artifacts: sysB });
  const a = first.engine.compareExperiment(SPEC, { now: NOW });
  const b = second.engine.compareExperiment(SPEC, { now: NOW });
  t.assert(stableStringify(a.result) === stableStringify(b.result), 'result objects identical');
  t.assert(stableStringify(a.report.data) === stableStringify(b.report.data), 'report data byte-stable');
  t.assert(a.written.reportId === b.written.reportId, 'reportId stable');
  const mirrorA = fs.readFileSync(path.join(first.engine.storageRoot, 'reports', '2026-08-11', 'experiment-report.json'), 'utf8');
  const mirrorB = fs.readFileSync(path.join(second.engine.storageRoot, 'reports', '2026-08-11', 'experiment-report.json'), 'utf8');
  t.assert(mirrorA === mirrorB, 'golden mirror files byte-identical');
  sysA.close();
  sysB.close();
}

t.section('zero-auto-apply: mutation attempts are denied everywhere');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'guards'), clock: fixedClock() });
  const denied = (fn) => {
    try {
      fn();
      return null;
    } catch (err) {
      return err.code;
    }
  };
  t.assert(denied(() => runCompareExperiment({ ...SPEC, apply: true }, engine.experimentsCtx)) === EXM_CODES.AUTO_APPLY_DENIED, 'spec.apply=true denied');
  t.assert(denied(() => runCompareExperiment({ ...SPEC, applyPolicy: 'true' }, engine.experimentsCtx)) === EXM_CODES.AUTO_APPLY_DENIED, 'spec.applyPolicy=true denied');
  t.assert(denied(() => runCompareExperiment({ ...SPEC, publish: true }, engine.experimentsCtx)) === EXM_CODES.AUTO_APPLY_DENIED, 'spec.publish=true denied');
  const hostileCtx = { ...engine.experimentsCtx, autoApply: true };
  t.assert(denied(() => runCompareExperiment(SPEC, hostileCtx)) === EXM_CODES.AUTO_APPLY_DENIED, 'ctx.autoApply denied');
  t.assert(denied(() => engine.compareExperiment({ ...SPEC, apply: true }, { now: NOW })) === EXM_CODES.AUTO_APPLY_DENIED, 'engine-level apply denied');
}

t.section('caps and guards: scopes, unknowns, limits');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'caps'), clock: fixedClock() });
  const errCode = (fn) => {
    try {
      fn();
      return null;
    } catch (err) {
      return err.code;
    }
  };
  t.assert(errCode(() => runCompareExperiment({ ...SPEC, name: '' }, engine.experimentsCtx)) === EXM_CODES.INVALID_SPEC, 'missing name rejected');
  t.assert(errCode(() => runCompareExperiment({ ...SPEC, scope: null }, engine.experimentsCtx)) === EXM_CODES.INVALID_SPEC, 'missing scope rejected');
  t.assert(errCode(() => runCompareExperiment({ ...SPEC, scope: { type: 'campaign', campaignId: 'camp-zzz' } }, engine.experimentsCtx)) === EXM_CODES.UNKNOWN_CAMPAIGN, 'unknown campaign rejected');
  t.assert(errCode(() => runCompareExperiment({ ...SPEC, altPolicyVersion: 'ver-0000000000000000' }, engine.experimentsCtx)) === EXM_CODES.UNKNOWN_POLICY_SET, 'unknown alt policy version rejected');
  t.assert(errCode(() => runCompareExperiment({ ...SPEC, basePolicyVersion: 'nope' }, engine.experimentsCtx)) === EXM_CODES.UNKNOWN_POLICY_SET, 'unknown base policy version rejected');
  const capped = runCompareExperiment({ ...SPEC, maxDecisions: 1 }, engine.experimentsCtx);
  t.assert(capped.summary.evaluated === 1 && capped.truncated === true, 'maxDecisions cap enforced', JSON.stringify({ evaluated: capped.summary.evaluated, truncated: capped.truncated }));
  t.assert(capped.budget.maxDecisions === 1 && capped.budget.wallClockMs === 60000, 'budget mirrors spec + default wall clock', JSON.stringify(capped.budget));
  t.assert(capped.experimentId === experimentIdFor(SPEC.name, SPEC.basePolicyVersion, SPEC.altPolicyVersion, CAMPAIGN_ID), 'experimentId independent of caps');
}

function altPolicyFailures(result) {
  return result.decisions.map((d) => ({ executionId: d.executionId, altPolicyFailure: d.altPolicyFailure }));
}

t.section('unversioned and skipped records are handled');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'unversioned'), clock: fixedClock() });
  const instances = path.join(BASE, 'unversioned', 'storage', 'orchestrator-engine', 'instances');
  // ex-1: old-style record without a stamp → evaluated, marked unversioned.
  const ex1 = JSON.parse(fs.readFileSync(path.join(instances, 'ex-1', 'decision.json'), 'utf8'));
  delete ex1.policyVersion;
  fs.writeFileSync(path.join(instances, 'ex-1', 'decision.json'), JSON.stringify(ex1, null, 2));
  // ex-2: no discovery record at all → skipped.
  fs.rmSync(path.join(instances, 'ex-2', 'record.json'), { force: true });
  const { result } = engine.compareExperiment(SPEC, { now: NOW, write: false });
  t.assert(result.summary.evaluated === 5, 'ex-2 skipped', String(result.summary.evaluated));
  t.assert(result.unversioned === 1, 'ex-1 marked unversioned', String(result.unversioned));
  t.assert(result.skipped === 1, 'one skipped execution', String(result.skipped));
  const ex1row = result.decisions.find((d) => d.executionId === 'ex-1');
  t.assert(ex1row && ex1row.flip === true && ex1row.altVerdict === 'REJECT', 'unversioned record still re-evaluated pure');
}

t.section('compare-experiment job: configured experiments run, no-op otherwise');
{
  const { engine } = await makeEngine({ base: path.join(BASE, 'job'), clock: fixedClock() });
  const noop = await engine.runJob('intelligence:compare_experiment', { window: WINDOW, now: NOW });
  t.assert(noop.windows === 1, 'no configured experiments → job is a no-op');
  t.assert(engine.insights.list('compare_experiment', { scopeType: 'campaign', scopeId: CAMPAIGN_ID }).length === 0, 'noop writes no insight');
  t.assert(!engine.metrics.readPoints().some((p) => p.metric.startsWith('experiment.')), 'noop writes no experiment metrics');

  const base2 = path.join(BASE, 'job2');
  const { fixture } = await makeEngine({ base: base2, clock: fixedClock() });
  const configFile = path.join(INT_ROOT, 'config', 'intelligence.config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const configuredBase = path.join(BASE, 'job2', 'configured');
  fs.mkdirSync(configuredBase, { recursive: true });
  config.experiments.jobs = [
    { name: SPEC.name, basePolicyVersion: SPEC.basePolicyVersion, altPolicyVersion: SPEC.altPolicyVersion, scope: SPEC.scope, maxDecisions: 100 }
  ];
  const rewritten = path.join(configuredBase, 'intelligence.config.json');
  fs.writeFileSync(rewritten, JSON.stringify(config, null, 2));
  const { createIntelligence } = await import('../index.js');
  const configured = createIntelligence({
    root: INT_ROOT,
    clock: fixedClock(),
    configFile: rewritten,
    orchestratorRoot: fixture.orchestratorRoot,
    deliveryRoot: fixture.deliveryRoot,
    schedulerBaseDir: fixture.schedulerBaseDir,
    killswitchRoot: fixture.orchestratorRoot,
    artifacts: new ArtifactSystem({ root: path.join(configuredBase, 'art'), sweeperMs: 0 }),
    storageRoot: path.join(configuredBase, 'intel-storage')
  });
  const result = await configured.runJob('intelligence:compare_experiment', { window: WINDOW, now: NOW });
  t.assert(result.name === 'intelligence:compare_experiment' && result.noop !== true, 'configured experiment executed');
  const insight = configured.insights.list('compare_experiment', { scopeType: 'campaign', scopeId: CAMPAIGN_ID }).find((i) => i.window.start === WINDOW.start);
  t.assert(Boolean(insight) && insight.data.summary.flipped === 5, 'insight carries experiment summary', JSON.stringify(insight && insight.data.summary));
  t.assert(insight.data.altPolicyVersion === STRICT_POLICY_VERSION.id, 'insight surfaces the alt version');
  const points = configured.metrics.readPoints();
  t.assert(points.some((p) => p.metric === 'experiment.flips' && p.value === 5), 'experiment.flips metric recorded', JSON.stringify(points.map((p) => p.metric)));
  t.assert(points.some((p) => p.metric === 'experiment.evaluated' && p.value === 6), 'experiment.evaluated metric recorded');
  const mirror = path.join(configured.storageRoot, 'reports', '2026-08-11', 'experiment-report.json');
  t.assert(fs.existsSync(mirror), 'job wrote the experiment-report mirror');
  t.assert(configured.experiments.enabled === true, 'experiments enabled');
  engine.stop();
}

t.section('experiments never write outside the intelligence storage');
{
  const base = path.join(BASE, 'nowrite');
  const sys = new ArtifactSystem({ root: path.join(BASE, 'art-nw'), sweeperMs: 0 });
  const { engine, fixture } = await makeEngine({ base, clock: fixedClock(), artifacts: sys, storageRoot: path.join(base, 'intel-storage') });
  const fingerprint = () => {
    const walk = (dir, rel = '') => {
      const out = {};
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        const key = path.join(rel, entry.name);
        if (entry.isDirectory()) Object.assign(out, walk(p, key));
        else out[key] = fs.readFileSync(p, 'utf8');
      }
      return out;
    };
    return walk(fixture.base);
  };
  const before = fingerprint();
  engine.compareExperiment(SPEC, { now: NOW });
  engine.evaluateCampaign({ campaignId: CAMPAIGN_ID, now: NOW, write: true });
  await engine.runJob('intelligence:campaign_evaluation', { window: WINDOW, now: NOW });
  await engine.runJob('intelligence:compare_experiment', { window: WINDOW, now: NOW });
  const after = fingerprint();
  const outside = Object.keys(after).filter((rel) => !rel.startsWith('intel-storage') && before[rel] !== after[rel]);
  t.assert(outside.length === 0, 'zero writes outside intel-storage', JSON.stringify(outside.slice(0, 5)));
  sys.close();
}

t.summary();