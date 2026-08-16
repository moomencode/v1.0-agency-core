export const FORMATS = {
  markdown: { extension: 'md', mime: 'text/markdown', binary: false },
  json: { extension: 'json', mime: 'application/json', binary: false },
  html: { extension: 'html', mime: 'text/html', binary: false },
  text: { extension: 'txt', mime: 'text/plain', binary: false },
  svg: { extension: 'svg', mime: 'image/svg+xml', binary: false },
  pdf: { extension: 'pdf', mime: 'application/pdf', binary: true },
  image: { extension: 'png', mime: 'image/png', binary: true }
};

export const ARTIFACT_TYPES = [
  'research-report',
  'seo-report',
  'brand-document',
  'ux-audit',
  'sales-proposal',
  'contract',
  'website-config',
  'website',
  'deployment-report',
  'qa-report',
  'campaign-report',
  'execution-report',
  'decision-record',
  'approval-record',
  'execution-trace',
  'review',
  'report',
  'document',
  'image',
  'other',
  'operations-report',
  'incident-digest',
  'alert-digest',
  'agency-health',
  'experiment-report',
  'evaluation-report',
  'observation-batch'
];

export const TYPE_LABELS = {
  'research-report': 'Research Report',
  'seo-report': 'SEO Report',
  'brand-document': 'Brand Document',
  'ux-audit': 'UX Audit',
  'sales-proposal': 'Sales Proposal',
  contract: 'Contract',
  'website-config': 'Website Configuration',
  website: 'Website',
  'deployment-report': 'Deployment Report',
  'qa-report': 'QA Report',
  'campaign-report': 'Campaign Report',
  'execution-report': 'Execution Report',
  'decision-record': 'Decision Record',
  'approval-record': 'Approval Record',
  'execution-trace': 'Execution Trace',
  review: 'Review',
  report: 'Report',
  document: 'Document',
  image: 'Image',
  other: 'Other',
  'operations-report': 'Operations Report',
  'incident-digest': 'Incident Digest',
  'alert-digest': 'Alert Digest',
  'agency-health': 'Agency Health Report',
  'experiment-report': 'Experiment Report',
  'evaluation-report': 'Evaluation Report',
  'observation-batch': 'Observation Batch'
};

export function resolveFormat(format) {
  const def = FORMATS[format];
  if (!def) throw new Error(`unknown artifact format "${format}"`);
  return { format, ...def };
}
