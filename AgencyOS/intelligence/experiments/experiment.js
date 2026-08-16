import { experimentIdFor } from '../ids.js';
import { round2 } from '../utils.js';
import { exmError, EXM_CODES } from './errors.js';

// ---------------------------------------------------------------------------
// Compare-experiment runner (4.7.1).
//
// PURE RERUN only: given a campaign already executed under a recorded policy
// version (base), it re-evaluates every stored record against an alternative
// policy set (alt) using the engines as plain libraries — no bus, no memory,
// no metrics, no planner, no plan runner, no orchestrator involvement and NO
// policy application. Everything the experiment needs is passed through `ctx`
// (reader, engines, policy registry, budget) so the function itself performs
// no I/O beyond the read-only record access it is given.
//
// Determinism: flips are a pure function of the stored records + policy sets.
// Shadow decisions reuse the recorded decisions' createdAt so two runs of the
// same window produce byte-identical experiment reports.

function normalizeScope(scope) {
  if (typeof scope === 'string') return { type: 'campaign', campaignId: scope };
  if (scope && typeof scope === 'object' && scope.type && scope.campaignId) {
    return { type: scope.type, campaignId: scope.campaignId };
  }
  return null;
}

function forbidAutoApply(spec, ctx, meta) {
  const flags = [spec.apply, spec.autoApply, spec.applyPolicy, spec.publish, spec.deploy, spec.commit];
  if (flags.some((f) => f === true || (typeof f === 'string' && f.toLowerCase() === 'true'))) {
    throw exmError(EXM_CODES.AUTO_APPLY_DENIED, 'experiments are advisory only — automatic policy application is never allowed', meta);
  }
  if (ctx && ctx.autoApply) throw exmError(EXM_CODES.AUTO_APPLY_DENIED, 'experiments are advisory only — automatic policy application is never allowed', meta);
}

function countByVerdict(entries, key) {
  const counts = { APPROVE: 0, REJECT: 0, ESCALATE: 0, PARK: 0 };
  for (const e of entries) {
    const v = String(e[key] || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(counts, v)) counts[v] += 1;
    else counts.OTHER = (counts.OTHER || 0) + 1;
  }
  return counts;
}

// Stored records use either the brain verdict vocabulary (APPROVE/REJECT/
// ESCALATE/PARK) or orchestrator outcome vocabulary (APPROVED/REJECTED/…).
// Normalize to the brain vocabulary so flips compare like with like.
const VERDICT_ALIASES = { APPROVED: 'APPROVE', REJECTED: 'REJECT', ESCALATED: 'ESCALATE', PARKED: 'PARK' };

export function normalizeVerdict(v) {
  const key = String(v || '').toUpperCase();
  return VERDICT_ALIASES[key] || key;
}

export function runCompareExperiment(spec, ctx = {}) {
  if (!spec || typeof spec !== 'object') throw exmError(EXM_CODES.INVALID_SPEC, 'experiment spec required', {});
  const { name, basePolicyVersion, altPolicyVersion } = spec;
  if (!name || typeof name !== 'string' || !name.trim()) throw exmError(EXM_CODES.INVALID_SPEC, 'experiment requires a name', {});
  if (!basePolicyVersion || typeof basePolicyVersion !== 'string') throw exmError(EXM_CODES.INVALID_SPEC, 'experiment requires basePolicyVersion', {});
  if (!altPolicyVersion || typeof altPolicyVersion !== 'string') throw exmError(EXM_CODES.INVALID_SPEC, 'experiment requires altPolicyVersion', {});
  const scope = normalizeScope(spec.scope);
  if (!scope) throw exmError(EXM_CODES.INVALID_SPEC, 'experiment scope must be a campaign id or { type: "campaign", campaignId }', {});

  forbidAutoApply(spec, ctx, { name, scope });

  const reader = ctx.reader;
  if (!reader || !reader.readCampaign || !reader.readDecision || !reader.readRecord) {
    throw exmError(EXM_CODES.REPORT_ERROR, 'experiment requires a records reader (read-only)', {});
  }
  const registry = ctx.policyRegistry || {};
  const baseSet = registry[basePolicyVersion];
  const altSet = registry[altPolicyVersion];
  if (!baseSet || !Array.isArray(baseSet.policies)) throw exmError(EXM_CODES.UNKNOWN_POLICY_SET, `unknown base policy version "${basePolicyVersion}"`, { policyVersion: basePolicyVersion });
  if (!altSet || !Array.isArray(altSet.policies)) throw exmError(EXM_CODES.UNKNOWN_POLICY_SET, `unknown alt policy version "${altPolicyVersion}"`, { policyVersion: altPolicyVersion });

  const campaign = reader.readCampaign(scope.campaignId);
  if (!campaign) throw exmError(EXM_CODES.UNKNOWN_CAMPAIGN, `no campaign "${scope.campaignId}"`, { campaignId: scope.campaignId });

  const budget = {
    maxDecisions: Number(spec.maxDecisions) || 5000,
    wallClockMs: Number(spec.wallClockMs) || 60000
  };
  const startedAt = Date.now();

  const { contextEngine, decisionEngine, PolicyEngine } = ctx;
  if (!contextEngine || !decisionEngine || !PolicyEngine) throw exmError(EXM_CODES.REPORT_ERROR, 'experiment requires contextEngine, decisionEngine and the PolicyEngine class', {});
  const altPolicy = new PolicyEngine({ policies: altSet.policies });

  const executions = (campaign.executions || []).filter((e) => e.executionId && e.businessId);
  const evaluations = [];
  let truncated = false;
  let skipped = 0;
  let unversioned = 0;

  for (const meta of executions) {
    if (evaluations.length >= budget.maxDecisions) {
      truncated = true;
      break;
    }
    if (Date.now() - startedAt > budget.wallClockMs) {
      truncated = true;
      break;
    }
    const stored = reader.readDecision(meta.executionId);
    const record = reader.readRecord(meta.executionId);
    if (!stored || !record) {
      skipped += 1;
      continue;
    }
    const recorded = stored.decision || stored;
    if (!recorded.verdict) {
      skipped += 1;
      continue;
    }
    const baseVerdict = normalizeVerdict(recorded.verdict);
    // Old records carry no stamp — they are evaluated but marked unversioned
    // (§25: re-run under the recorded policySummary only).
    if (!recorded.policyVersion) unversioned += 1;
    const shadowContext = contextEngine.build(record);
    shadowContext.estimates = decisionEngine.estimate(shadowContext);
    const policyResult = altPolicy.evaluate(shadowContext);
    const policySummary = { ...altPolicy.summarize(policyResult), mandatoryFailed: policyResult.mandatoryFailed };
    const altDecision = decisionEngine.evaluate(shadowContext, { policies: { summary: policySummary } });
    altDecision.createdAt = recorded.createdAt || altDecision.createdAt;
    const flip = altDecision.verdict !== baseVerdict;
    evaluations.push({
      executionId: meta.executionId,
      businessId: meta.businessId,
      baseVerdict,
      altVerdict: altDecision.verdict,
      flip,
      basePolicyFailure: recorded.policySummary ? recorded.policySummary.verdict : null,
      altPolicyFailure: policySummary.verdict
    });
  }

  const evaluated = evaluations.length;
  const flipped = evaluations.filter((e) => e.flip).length;
  const result = {
    experimentId: experimentIdFor(name, basePolicyVersion, altPolicyVersion, scope.campaignId),
    name,
    basePolicyVersion,
    altPolicyVersion,
    scope,
    decisions: evaluations,
    summary: {
      evaluated,
      flipped,
      flipRate: evaluated ? round2(flipped / evaluated) : 0,
      base: countByVerdict(evaluations, 'baseVerdict'),
      alt: countByVerdict(evaluations, 'altVerdict')
    },
    unversioned,
    skipped,
    truncated,
    budget: { maxDecisions: budget.maxDecisions, wallClockMs: budget.wallClockMs }
  };
  return result;
}