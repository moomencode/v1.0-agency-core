import { writeReportArtifacts, baseReport, mdTable, mdSection } from './report.mjs';
import { runCompareExperiment } from '../experiments/experiment.js';

// Compare-experiment report (4.7.1): wraps the pure rerun result into a
// deterministic experiment-report artifact. Pinned `now` + shadow decisions
// that reuse recorded createdAt values make reports byte-stable across reruns.

function engineError(engine, message, meta) {
  const err = new Error(message);
  err.code = 'INT_UNKNOWN_REPORT';
  err.meta = meta;
  return err;
}

export function buildExperimentReport({ engine, now, result }) {
  const s = result.summary;
  const data = {
    ...baseReport('experiment', now, `Experiment Report — ${result.name}`, `${s.evaluated} decisions re-evaluated under "${result.altPolicyVersion}", ${s.flipped} verdict flips.`),
    experimentId: result.experimentId,
    name: result.name,
    basePolicyVersion: result.basePolicyVersion,
    altPolicyVersion: result.altPolicyVersion,
    scope: result.scope,
    stats: s,
    unversioned: result.unversioned,
    skipped: result.skipped,
    truncated: result.truncated,
    decisions: result.decisions.map((d) => ({
      executionId: d.executionId,
      businessId: d.businessId,
      baseVerdict: d.baseVerdict,
      altVerdict: d.altVerdict,
      flip: d.flip,
      basePolicyFailure: d.basePolicyFailure,
      altPolicyFailure: d.altPolicyFailure
    }))
  };
  const markdown = [
    `# ${data.title}`,
    '',
    `> ${data.summary}`,
    '',
    `- Generated at: \`${now}\``,
    `- Report id: \`${data.reportId}\``,
    `- Experiment id: \`${data.experimentId}\``,
    `- Baseline: \`${result.basePolicyVersion}\` → Alternative: \`${result.altPolicyVersion}\``,
    '',
    mdSection('Summary', mdTable(['Metric', 'Value'], [
      ['evaluated', s.evaluated],
      ['flipped', s.flipped],
      ['flipRate', s.flipRate],
      ['unversioned', result.unversioned],
      ['skipped', result.skipped],
      ['truncated', result.truncated]
    ])),
    mdSection('Base verdicts', mdTable(['Verdict', 'Count'], Object.entries(s.base))),
    mdSection('Alt verdicts', mdTable(['Verdict', 'Count'], Object.entries(s.alt))),
    mdSection('Flips', data.decisions.some((d) => d.flip)
      ? mdTable(['Execution', 'Business', 'Base', 'Alt'], data.decisions.filter((d) => d.flip).map((d) => [d.executionId, d.businessId, d.baseVerdict, d.altVerdict]))
      : '_none_')
  ].join('\n');
  return { data, markdown };
}

export function writeExperimentReport({ deps, now, result, runId = null }) {
  const report = buildExperimentReport({ engine: deps, now, result });
  if (!deps.artifacts) {
    throw engineError(deps, 'writeExperimentReport requires an artifacts manager', { experimentId: result.experimentId });
  }
  const written = writeReportArtifacts({
    artifacts: deps.artifacts,
    report,
    projectId: deps.config.reports?.projectId || 'agency',
    workflowId: deps.config.reports?.workflowId || 'intelligence',
    runId,
    storageRoot: deps.storageRoot
  });
  return { report, written };
}

export function runAndReportExperiment({ engine, spec, now }) {
  const result = runCompareExperiment(spec, engine.experimentsCtx);
  const { report, written } = writeExperimentReport({ deps: engine, now, result });
  return { result, report, written };
}