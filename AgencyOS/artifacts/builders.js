export function buildRunReport(runResult) {
  const lines = ['# Run Report', ''];
  lines.push(`- Run: \`${runResult.runId}\``);
  lines.push(`- Workflow: \`${runResult.workflowId}\``);
  lines.push(`- Status: **${runResult.status}**`);
  if (runResult.startedAt) lines.push(`- Started: ${runResult.startedAt}`);
  if (runResult.finishedAt) lines.push(`- Finished: ${runResult.finishedAt}`);
  lines.push('', '## Documents Produced', '');
  const documents = runResult.documents ?? {};
  const names = Object.keys(documents);
  if (names.length === 0) {
    lines.push('_none_');
  } else {
    for (const name of names) {
      const doc = documents[name];
      lines.push(`- \`${name}\`` + (doc?.checksum ? ` (checksum \`${doc.checksum}\`)` : ''));
    }
  }
  lines.push('', '## Steps', '');
  const steps = runResult.steps ?? [];
  if (steps.length === 0) {
    lines.push('_none_');
  } else {
    lines.push('| Step | Actor | Status | Duration |', '| --- | --- | --- | --- |');
    for (const step of steps) {
      lines.push(`| ${step.id} | ${step.actor} | ${step.status} | ${step.durationMs ?? '-'}ms |`);
    }
  }
  const metrics = runResult.metrics;
  if (metrics && Object.keys(metrics).length > 0) {
    lines.push('', '## Metrics', '');
    for (const [k, v] of Object.entries(metrics)) {
      lines.push(`- **${k}**: \`${JSON.stringify(v)}\``);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function buildSeoReport(document, value) {
  const data = value ?? document.value ?? {};
  const title = document.title ?? document.name ?? 'SEO Report';
  const lines = [`# ${title}`, ''];
  if (document.summary) lines.push(`> ${document.summary}`, '');
  lines.push('| Dimension | Value |', '| --- | --- |');
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'object') continue;
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('', '## Recommendations', '', '- [ ] Verify meta descriptions are under 160 characters', '- [ ] Confirm heading hierarchy (one H1 per page)', '- [ ] Check canonical URLs and internal linking', '- [ ] Validate structured data (JSON-LD)', '');
  return lines.join('\n');
}

export function buildWebsiteConfig(document, value) {
  const data = value ?? document.value ?? {};
  const config = {
    schema: 'https://agency.os/engine/website-config',
    engineVersion: data.engineVersion ?? '1.0.0',
    businessId: data.businessId ?? null,
    config: data.config ?? data,
    assetManifest: data.assetManifest ?? [],
    buildParams: data.buildParams ?? {},
    conflicts: data.conflicts ?? [],
    warnings: data.warnings ?? [],
    sourceDocument: document.name ?? null,
    generatedAt: new Date().toISOString()
  };
  return JSON.stringify(config, null, 2);
}

export function buildProposal(document, value) {
  const data = value ?? document.value ?? {};
  const lines = [`# ${data.title ?? 'Sales Proposal'}`, ''];
  if (data.status) lines.push(`> Status: **${data.status}**`, '');
  lines.push('## Executive Summary', '');
  lines.push(data.summary ?? data.executiveSummary ?? document.summary ?? '_to be drafted_', '');
  lines.push('## Scope', '');
  const scope = data.scope ?? data.package ?? data.lineItems;
  if (Array.isArray(scope)) {
    lines.push('| Item | Notes |', '| --- | --- |');
    for (const item of scope) {
      lines.push(`| ${item.name ?? item.id ?? item} | ${item.description ?? item.details ?? ''} |`);
    }
  } else if (scope && typeof scope === 'object') {
    for (const [k, v] of Object.entries(scope)) lines.push(`- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  } else {
    lines.push('_to be drafted_');
  }
  lines.push('', '## Pricing', '');
  const pricing = data.pricing ?? data.costs ?? data.total;
  if (pricing && typeof pricing === 'object') {
    for (const [k, v] of Object.entries(pricing)) lines.push(`- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  } else if (pricing !== undefined) {
    lines.push(`- Total: **${pricing}**`);
  } else {
    lines.push('_to be drafted_');
  }
  lines.push('', '## Terms', '');
  lines.push(data.terms ?? '_standard terms apply_', '');
  return lines.join('\n');
}

export function buildUxAudit(document, value) {
  const data = value ?? document.value ?? {};
  const title = document.title ?? document.name ?? 'UX Audit';
  const lines = [`# ${title}`, ''];
  if (document.summary) lines.push(`> ${document.summary}`, '');
  lines.push('## Findings', '');
  const findings = data.findings ?? data.defects ?? data.checks;
  if (Array.isArray(findings)) {
    lines.push('| Severity | Finding |', '| --- | --- |');
    for (const f of findings) {
      lines.push(`| ${f.severity ?? f.status ?? 'info'} | ${f.title ?? f.message ?? JSON.stringify(f)} |`);
    }
  } else {
    lines.push('_no findings recorded_');
  }
  lines.push('', '## Verdict', '');
  lines.push(`**${data.verdict ?? data.approval ?? 'pending'}**`, '');
  return lines.join('\n');
}

export function buildBrandDocument(document, value) {
  const data = value ?? document.value ?? {};
  const lines = [`# ${data.name ?? document.title ?? document.name ?? 'Brand Document'}`, ''];
  if (data.tagline) lines.push(`> ${data.tagline}`, '');
  lines.push('## Identity', '');
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'object' || ['name', 'tagline'].includes(k)) continue;
    lines.push(`- **${k}**: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  lines.push('', '## Voice & Tone', '');
  const voice = data.voice ?? data.tone ?? data.persona;
  if (voice && typeof voice === 'object') {
    for (const [k, v] of Object.entries(voice)) lines.push(`- **${k}**: ${v}`);
  } else if (voice) {
    lines.push(String(voice));
  } else {
    lines.push('_not defined_');
  }
  lines.push('', '## Palette', '');
  const palette = data.palette ?? data.colors;
  if (palette) {
    lines.push('```json', JSON.stringify(palette, null, 2), '```');
  } else {
    lines.push('_not defined_');
  }
  lines.push('');
  return lines.join('\n');
}

export function buildContract(document, value) {
  const data = value ?? document.value ?? {};
  const lines = [`# ${data.title ?? 'Services Agreement'}`, ''];
  if (data.status) lines.push(`> Status: **${data.status}**`, '');
  lines.push('## Parties', '');
  lines.push((data.parties ?? data.counterparty) ? `- Provider: **AgencyOS**\n- Client: **${data.parties ?? data.counterparty}**` : '- Client: _to be confirmed_', '');
  lines.push('## Terms', '');
  const terms = data.terms ?? data.conditions;
  if (Array.isArray(terms)) {
    for (const t of terms) lines.push(`1. ${typeof t === 'string' ? t : JSON.stringify(t)}`);
  } else if (terms && typeof terms === 'object') {
    for (const [k, v] of Object.entries(terms)) lines.push(`- **${k}**: ${v}`);
  } else {
    lines.push('_standard terms apply_');
  }
  lines.push('', '## Signature', '', 'Date: ____________    Signature: ____________', '');
  return lines.join('\n');
}

export const WORKFLOW_BUILDERS = {
  'business-analysis': { type: 'research-report', builder: (doc, value) => buildRunReport({ ...(doc.extra ?? {}), documents: { [doc.name ?? 'document']: { checksum: doc.checksum } } }) },
  'website-generation': { type: 'website-config', builder: buildWebsiteConfig },
  qa: { type: 'ux-audit', builder: buildUxAudit },
  sales: { type: 'sales-proposal', builder: buildProposal }
};
