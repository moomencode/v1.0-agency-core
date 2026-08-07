import { CONFIG_IDS } from './schemas/index.js';

function table(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => '| ' + cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ') + ' |';
  const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';
  return [line(headers), sep, ...rows.map((r) => line(r))].join('\n');
}

function stageLines(stages) {
  return stages.map((s) => `| ${s.id.padEnd(26)} | ${String(s.ok).padEnd(5)} | ${String(s.durationMs).padEnd(8)} | ${s.detail || ''} |`).join('\n');
}

export function pipelineReport(ctx) {
  const stages = ctx.stages;
  const ok = stages.filter((s) => s.ok).length;
  return `# Pipeline Report — ${ctx.businessId}

> Pipeline: ${ctx.pipelineId} v${ctx.pipelineVersion} · run ${ctx.runId} · started ${ctx.startedAt} · finished ${ctx.finishedAt || 'n/a'} · resumed ${ctx.resumed ? 'yes' : 'no'}

## Summary

| Metric | Value |
|---|---|
| Business | ${ctx.name} (${ctx.category}) |
| Verdict (dossier) | ${ctx.normalized?.summary?.verdict || 'n/a'} |
| Stages completed | ${ok}/${stages.length} |
| Status | ${ctx.status} |
| Configs generated | ${ctx.configCount} |
| Reports | ${ctx.reportCount} |

## Stage Log

| Stage | OK | ms | Detail |
|---|---|---|---|
${stageLines(stages)}

## Output

- Build package: ${ctx.outputRoot}
- Config: ${ctx.configCount} schema-validated JSON files
- QA: ${ctx.qaPassed ? 'PASSED' : 'FAILED'} (${ctx.qaChecks} checks)
`;
}

export function generationReport(ctx) {
  const configs = ctx.configs || {};
  const expected = CONFIG_IDS.length;
  const rows = Object.keys(configs)
    .sort()
    .map((fileId) => {
      const v = configs[fileId];
      const bytes = Buffer.byteLength(JSON.stringify(v, null, 2));
      const checksum = ctx.checksums?.[fileId] ? ctx.checksums[fileId].slice(0, 12) : '-';
      return [fileId, 'config', String(bytes), checksum, 'valid'];
    });
  const assetRows = Object.values(ctx.manifest?.groups || {}).flat().map((a) => [a.path, a.role || '-', a.source || '-']);
  return `# Generation Report — ${ctx.businessId}

> Run ${ctx.runId} — deterministic generation (same dossier → identical files)

## Config Files (${rows.length}/${expected})

| File | Kind | Bytes | sha256 (12) | Status |
|---|---|---|---|
${rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} |`).join('\n')}

## Assets Manifest

> Declarative only — no assets were downloaded.

${table(assetRows, ['Path', 'Role', 'Source'])}

## Structured Data

- Schema type: ${ctx.structuredData?.schemaType || '-'}
- Graph nodes: ${ctx.structuredData?.['@graph']?.length || 0}
`;
}

export function validationReport(ctx) {
  const v = ctx.validation || {};
  const perConfig = v.perConfig || [];
  const rows = perConfig.map((c) => [c.fileId, String(c.valid), c.errors.length ? c.errors.join('; ') : '-']);
  return `# Validation Report — ${ctx.businessId}

> Run ${ctx.runId} · validator ${v.validator === 'wired' ? 'runtime schema validator' : 'built-in structural'}

## Dossier Validation

| Check | Result |
|---|---|
| dossier present | ${v.dossierValid ? 'ok' : 'FAILED'} |
| normalized errors | ${(ctx.normalized?.errors || []).join('; ') || 'none'} |

## Config Validation (${rows.length} files)

| File | Valid | Errors |
|---|---|---|
${rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join('\n')}

> Rule: no invalid config may continue — ${v.allValid ? 'all configs passed, build continued.' : 'build halted on invalid configs.'}
`;
}

export function qaReport(ctx) {
  const qa = ctx.qa || {};
  const rows = qa.checks?.map((c) => [c.name, String(c.ok), c.level, c.details || '-']) || [];
  return `# QA Report — ${ctx.businessId}

> Run ${ctx.runId} · ${qa.passed ? 'PASSED' : 'FAILED'} · ${qa.checkCount} checks

## Checks

| Check | OK | Level | Details |
|---|---|---|---|
${rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`).join('\n')}

${qa.passed ? 'All checks passed — the website config bundle is ready for production.' : 'At least one check failed — the build must not be deployed until resolved.'}
`;
}

export function buildReports(ctx) {
  const reports = {
    'pipeline-report.md': pipelineReport(ctx),
    'generation-report.md': generationReport(ctx),
    'validation-report.md': validationReport(ctx),
    'qa-report.md': qaReport(ctx)
  };
  return reports;
}
