export function buildRecordReport(record) {
  const probe = record.probe && typeof record.probe === 'object' ? record.probe : null;
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    area: record.area,
    sources: record.sources,
    business: {
      score: record.scores.business.value,
      breakdown: record.scores.business.breakdown
    },
    opportunity: {
      score: record.scores.opportunity.value,
      tier: record.scores.salesPriority.tier,
      rank: record.scores.salesPriority.rank,
      percentile: record.scores.salesPriority.percentile,
      demand: record.scores.opportunity.demand,
      neglect: record.scores.opportunity.neglect,
      bonus: record.scores.opportunity.bonus,
      major: record.scores.opportunity.major,
      minor: record.scores.opportunity.minor
    },
    weaknesses: {
      count: record.weaknesses.length,
      items: record.weaknesses.map((w) => ({ id: w.id, label: w.label, severity: w.severity, category: w.category, evidence: w.evidence }))
    },
    digitalPresence: {
      website: {
        present: !!record.website,
        url: record.website,
        ok: probe ? probe.ok : null,
        status: probe ? probe.status : null,
        timeMs: probe ? probe.timeMs : null,
        https: probe ? probe.isHttps : null
      },
      seo: probe
        ? { title: !!probe.title, metaDescription: !!probe.metaDescription, h1: !!probe.hasH1, viewport: !!probe.hasViewport, lang: !!probe.hasLang }
        : null,
      design: probe ? { copyrightYear: probe.copyrightYear, generatorHint: probe.generatorHint } : null,
      social: { instagram: record.instagram, facebook: record.facebook },
      contact: { phone: record.phone, whatsapp: record.whatsapp, email: record.email, address: record.address },
      content: {
        photos: (record.photos || []).length,
        menus: (record.menus || []).length,
        openingHours: (record.openingHours || []).length,
        booking: record.booking
      }
    }
  };
}

export function buildSummaryReport({ runId, query, metrics, records }) {
  const sorted = records
    .slice()
    .sort((a, b) => (a.scores.salesPriority.rank || 99) - (b.scores.salesPriority.rank || 99));
  return {
    report: 'summary',
    runId,
    query,
    generatedAt: metrics.finishedAt,
    metrics,
    counts: {
      discovered: metrics.merged,
      saved: metrics.saved,
      saveErrors: metrics.saveErrors
    },
    topOpportunities: sorted.slice(0, 5).map((r) => ({
      name: r.name,
      category: r.category,
      area: r.area,
      business: r.scores.business.value,
      opportunity: r.scores.opportunity.value,
      tier: r.scores.salesPriority.tier,
      rank: r.scores.salesPriority.rank
    })),
    tiers: metrics.tierCounts
  };
}

function section(name, rows, headers) {
  const lines = [`## ${name}`, '', '| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |'];
  for (const row of rows) lines.push('| ' + headers.map((h) => String(row[h] ?? '').replace(/\|/g, '/')).join(' | ') + ' |');
  return lines.join('\n');
}

export function toMarkdown({ runId, query, metrics, records }) {
  const out = [];
  out.push('# Business Discovery Report', '');
  out.push(`**Run:** \`${runId}\``);
  out.push(`**Query:** \`${JSON.stringify(query)}\``);
  out.push(`**Generated:** ${metrics.finishedAt} · **Duration:** ${metrics.durationMs}ms`);
  out.push('');

  out.push(section('Execution Metrics', [
    { metric: 'Candidates from sources', value: metrics.candidatesTotal },
    { metric: 'Merged (after dedupe)', value: metrics.merged },
    { metric: 'Dropped (invalid)', value: metrics.invalidDropped },
    { metric: 'Skipped sources', value: metrics.skippedSources.join(', ') || 'none' },
    { metric: 'Websites probed', value: `${metrics.probed.attempted} (${metrics.probed.ok} ok, ${metrics.probed.failed} failed)` },
    { metric: 'Saved', value: metrics.saved },
    { metric: 'Save errors', value: metrics.saveErrors },
    { metric: 'Average business score', value: metrics.avgBusiness },
    { metric: 'Average opportunity', value: metrics.avgOpportunity }
  ], ['metric', 'value']));
  out.push('');

  const tiers = metrics.tierCounts;
  out.push(section('Summary', [
    { tier: 'HIGH', count: tiers.high || 0 },
    { tier: 'MEDIUM', count: tiers.medium || 0 },
    { tier: 'LOW', count: tiers.low || 0 }
  ], ['tier', 'count']));
  out.push('');

  const sorted = records
    .slice()
    .sort((a, b) => (a.scores.salesPriority.rank || 99) - (b.scores.salesPriority.rank || 99));
  out.push(section('Priority Ranking', sorted.map((r) => ({
    rank: r.scores.salesPriority.rank,
    name: r.name,
    category: r.category,
    area: r.area,
    business: r.scores.business.value,
    opportunity: r.scores.opportunity.value,
    tier: r.scores.salesPriority.tier,
    weaknesses: r.weaknesses.length
  })), ['rank', 'name', 'category', 'area', 'business', 'opportunity', 'tier', 'weaknesses']));
  out.push('');

  for (const record of sorted) {
    const report = buildRecordReport(record);
    out.push(`## ${report.name} — ${report.category} (${report.area})`, '');
    out.push(`### Business Report`, '');
    out.push(section('Business Score', [
      { component: 'Presence (30)', score: report.business.breakdown.presence },
      { component: 'Contact (20)', score: report.business.breakdown.contact },
      { component: 'Content (25)', score: report.business.breakdown.content },
      { component: 'Reputation (25)', score: report.business.breakdown.reputation },
      { component: '**Total**', score: report.business.score }
    ], ['component', 'score']));
    out.push('');

    out.push(`### Opportunity Report`, '');
    const op = report.opportunity;
    out.push(section('Opportunity Score', [
      { component: 'Demand (0.4 weight)', value: op.demand },
      { component: 'Neglect (0.6 weight)', value: op.neglect },
      { component: 'Weakness bonus', value: op.bonus },
      { component: '**Total**', value: op.score },
      { component: 'Priority', value: `${op.tier.toUpperCase()} (rank ${op.rank}, top ${op.percentile}%)` }
    ], ['component', 'value']));
    out.push('');

    out.push(`### Weakness Report`, '');
    if (!report.weaknesses.count) {
      out.push('No weaknesses detected.', '');
    } else {
      out.push(section('Detected Weaknesses', report.weaknesses.items.map((w) => ({
        id: w.id,
        severity: w.severity,
        label: w.label,
        evidence: w.evidence
      })), ['id', 'severity', 'label', 'evidence']));
      out.push('');
    }

    out.push(`### Digital Presence Report`, '');
    const web = report.digitalPresence.website;
    const seo = report.digitalPresence.seo;
    const design = report.digitalPresence.design;
    const social = report.digitalPresence.social;
    const contact = report.digitalPresence.contact;
    const content = report.digitalPresence.content;
    out.push(section('Website', [
      { field: 'Present', value: web.present ? 'yes' : 'no' },
      { field: 'URL', value: web.url || '—' },
      { field: 'Status', value: web.ok === null ? 'not probed' : web.ok ? `ok (HTTP ${web.status}, ${web.timeMs}ms, ${web.https ? 'https' : 'http'})` : `FAILED (HTTP ${web.status})` },
      ...(seo ? [
        { field: 'SEO title', value: seo.title ? 'present' : 'missing' },
        { field: 'SEO description', value: seo.metaDescription ? 'present' : 'missing' },
        { field: 'H1', value: seo.h1 ? 'present' : 'missing' },
        { field: 'Mobile viewport', value: seo.viewport ? 'present' : 'missing' },
        { field: 'lang attribute', value: seo.lang ? 'present' : 'missing' }
      ] : []),
      ...(design ? [
        { field: 'Copyright year', value: design.copyrightYear || '—' },
        { field: 'Generator', value: design.generatorHint || '—' }
      ] : [])
    ], ['field', 'value']));
    out.push('');
    out.push(section('Social & Contact', [
      { field: 'Instagram', value: social.instagram || '—' },
      { field: 'Facebook', value: social.facebook || '—' },
      { field: 'Phone', value: contact.phone || '—' },
      { field: 'WhatsApp', value: contact.whatsapp || '—' },
      { field: 'Email', value: contact.email || '—' },
      { field: 'Address', value: contact.address || '—' }
    ], ['field', 'value']));
    out.push('');
    out.push(section('Content', [
      { field: 'Photos', value: content.photos },
      { field: 'Menus', value: content.menus },
      { field: 'Opening hours', value: content.openingHours },
      { field: 'Booking channel', value: content.booking || '—' }
    ], ['field', 'value']));
    out.push('');
  }

  return out.join('\n');
}
