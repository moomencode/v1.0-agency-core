import { scratchRoot, createStack, baseSpec } from './helpers.mjs';

const root = scratchRoot('debug9');
const stack = await createStack(root);
const spec = baseSpec();
const query = spec.discovery.query;
const result = await stack.discovery.run(query, { sources: spec.discovery.sources });
let record = null;
for (const b of result.businesses) {
  const r = await stack.brain.runBusiness(b, { emit: false });
  if (r.decision.verdict === 'APPROVE') { record = b; break; }
}
const brainResult = await stack.brain.runBusiness(record, { emit: false });
const d = await stack.dossier.build(brainResult, { persist: true, update: false, requireApproved: true });
const ctx = await stack.pipeline.run(d, { runId: 'run-debug', resume: true, businessId: record.id, pipelineId: 'website-production' });
const site = stack.website.build(ctx.configs, { manifest: ctx.manifest, structuredData: ctx.structuredData });
const validation = stack.website.validate(site);
console.log('validation passed:', validation.passed);
for (const p of validation.pages) {
  const bad = p.checks.filter((c) => !c.ok);
  if (bad.length) console.log('[' + p.id + ']', bad.map((c) => c.id + ': ' + c.errors.join('; ')).join(' | '));
}
const built = await stack.delivery.builds.build(record.id, {
  site,
  validation,
  trace: { dossierVersion: d.version, pipelineRunId: ctx.runId }
});
console.log('buildId:', built.buildId, 'reused:', built.reused, 'files:', built.record.fileCount);
const tree = stack.delivery.builds.readTree(built.buildId);
console.log('tree has delivery-meta.json:', 'delivery-meta.json' in tree, 'keys:', Object.keys(tree).length);
const qa = stack.delivery.qa.run({ buildId: built.buildId, site, validation, buildRecord: built.record, files: tree });
console.log('QA passed:', qa.passed, '(' + qa.totals.checks + ' checks, ' + qa.totals.failed + ' failed)');
for (const g of qa.groups) {
  const bad = g.checks.filter((c) => !c.ok);
  if (bad.length) console.log('[' + g.id + ']', bad.map((c) => c.id + ': ' + c.errors.slice(0, 3).join('; ')).join(' | '));
}
