import { buildSite } from './builders/index.js';
import { validateSite } from './validators/index.js';
import { exportFiles, writeExport, EXPORT_FORMATS } from './export/index.js';
import { previewFiles } from './preview/index.js';
import { cssVariables } from './theme/index.js';
import { generateSiteCss } from './theme/site-css.js';
import { webError, WEB_CODES } from './errors.js';
import { stableJson } from './utils.js';

export class WebsiteEngine {
  constructor({ logger = null } = {}) {
    this.logger = logger;
  }

  build(configs, { manifest = null, structuredData = null, overrideLayout = null } = {}) {
    return buildSite(configs, { manifest, structuredData, overrideLayout });
  }

  validate(site) {
    const css = `${cssVariables(site.theme)}\n${generateSiteCss(site.theme)}`;
    const report = validateSite(site, { css });
    this.logger?.info?.(`website-engine validate: ${report.passed ? 'PASS' : 'FAIL'} (${report.totals.checks} checks)`, { businessId: site.businessId });
    return report;
  }

  export(site, { format = 'all', root = null, validation = null } = {}) {
    if (root) return writeExport(site, { format, root, validation });
    return exportFiles(site, { format, validation });
  }

  preview(site, { root = null } = {}) {
    const files = previewFiles(site);
    if (root) {
      return import('./export/write.js').then(({ writeFiles }) => writeFiles(root, files));
    }
    return files;
  }

  report(site, validation = null) {
    return siteReport(site, validation);
  }
}

export function createWebsiteEngine(opts = {}) {
  return new WebsiteEngine(opts);
}

export function siteReport(site, validation = null) {
  const lines = [
    `# Website Engine Report — ${site.name}`,
    '',
    `| field | value |`,
    '|---|---|',
    `| businessId | ${site.businessId} |`,
    `| category | ${site.category} |`,
    `| layout | ${site.layout.label} (${site.layout.id}) |`,
    `| pages | ${site.pages.map((p) => p.path).join(', ')} |`,
    `| theme mode | ${site.theme.defaultMode} |`,
    `| assets referenced | ${site.assets.count} (missing: ${site.assets.missing.length}) |`,
    `| engine version | ${site.engineVersion} |`,
    ''
  ];
  if (validation) {
    lines.push('## Validation', '');
    lines.push(`**${validation.passed ? 'PASS' : 'FAIL'}** — ${validation.totals.pages} pages, ${validation.totals.checks} checks, ${validation.totals.failed} failed.`);
    lines.push('');
    for (const page of validation.pages) {
      lines.push(`### ${page.id} (${page.path}) — ${page.ok ? 'PASS' : 'FAIL'}`);
      lines.push('');
      for (const c of page.checks) {
        lines.push(`- [${c.ok ? 'PASS' : 'FAIL'}] ${c.id}${c.errors.length ? ': ' + c.errors.join('; ') : ''}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

export { buildSite } from './builders/index.js';
export { validateSite } from './validators/index.js';
export { EXPORT_FORMATS } from './export/index.js';
export { LAYOUTS, layoutFor, layoutIdFor } from './layouts/index.js';
export { SECTION_DEFS, SECTION_MAP, SECTION_BUILDERS } from './sections/index.js';
export { WEB_CODES, webError } from './errors.js';
export { stableJson } from './utils.js';
