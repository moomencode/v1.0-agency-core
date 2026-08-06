export function buildReport({ kind, target, findings, checks, durationMs, startedAt }) {
  const summary = { errors: 0, warnings: 0, infos: 0 };
  for (const f of findings) {
    const key = f.severity === 'warning' ? 'warnings' : f.severity === 'info' ? 'infos' : 'errors';
    summary[key]++;
  }
  return {
    kind,
    target,
    valid: summary.errors === 0,
    startedAt,
    durationMs: Math.round(durationMs * 100) / 100,
    summary: { ...summary, total: findings.length },
    checks,
    findings
  };
}

const LABELS = { error: 'ERROR', warning: 'WARN', info: 'INFO' };
const ORDER = ['error', 'warning', 'info'];

export function toMarkdown(report) {
  const lines = [];
  lines.push('# Validation Report');
  lines.push('');
  lines.push(`**${report.kind}** \u00b7 ${report.target} \u00b7 ${report.valid ? 'VALID' : 'INVALID'} \u00b7 ${report.durationMs}ms`);
  lines.push('');
  lines.push(`**Summary:** ${report.summary.total} finding(s) - ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.infos} info(s) \u00b7 ${report.checks.length} check(s)`);
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('No findings - payload is clean.');
    lines.push('');
  }
  for (const sev of ORDER) {
    const group = report.findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    lines.push(`## ${sev.toUpperCase()}S`);
    lines.push('');
    for (const f of group) {
      let line = `- [${LABELS[sev]}] \`${f.path}\` \u2014 ${f.message}`;
      if (f.ref) line += ` (ref: ${f.ref})`;
      lines.push(line);
      if (f.detail) lines.push(`  ${f.detail}`);
      if (f.suggestions && f.suggestions.length) lines.push(`  fix: ${f.suggestions.join('; ')}`);
    }
    lines.push('');
  }
  lines.push('## Checks');
  lines.push('');
  lines.push('| check | result | findings |');
  lines.push('| --- | --- | --- |');
  for (const c of report.checks) lines.push(`| ${c.id} | ${c.passed ? 'PASS' : 'FAIL'} | ${c.findings} |`);
  lines.push('');
  return lines.join('\n');
}
