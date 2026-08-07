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
  'review',
  'report',
  'document',
  'image',
  'other'
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
  review: 'Review',
  report: 'Report',
  document: 'Document',
  image: 'Image',
  other: 'Other'
};

export function resolveFormat(format) {
  const def = FORMATS[format];
  if (!def) throw new Error(`unknown artifact format "${format}"`);
  return { format, ...def };
}
