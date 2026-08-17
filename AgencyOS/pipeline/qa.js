import { CONFIG_IDS, validateConfigAgainstSchema } from './schemas/index.js';

export function runQA({ configs, themeTokens, sections, manifest, structuredData, validation, logger = null }) {
  const checks = [];
  const nConfigs = CONFIG_IDS.length;

  const push = (name, ok, details, level = 'error') => checks.push({ name, ok, details, level });

  const configValid = [];
  for (const fileId of CONFIG_IDS) {
    const cfg = configs[fileId];
    const r = validateConfigAgainstSchema(cfg, fileId, validation.validateFn);
    configValid.push({ fileId, valid: r.valid, errors: r.errors });
  }
  push('config-validation', configValid.every((c) => c.valid), configValid.filter((c) => !c.valid).map((c) => `${c.fileId}: ${c.errors.join('; ')}`).join(' | ') || `all ${nConfigs} configs valid`);

  const themeChecks = [];
  const has = (obj, keys) => keys.every((k) => obj && obj[k] !== undefined);
  if (!has(themeTokens.colors, ['dark', 'light'])) themeChecks.push('colors.dark/light missing');
  if (!has(themeTokens.colors.dark, ['base', 'primary', 'ink'])) themeChecks.push('dark palette incomplete');
  if (!has(themeTokens.colors.light, ['base', 'primary', 'ink'])) themeChecks.push('light palette incomplete');
  if (!has(themeTokens.typography, ['display', 'body', 'fontsUrl'])) themeChecks.push('typography incomplete');
  if (!has(themeTokens, ['spacing', 'radius', 'shadows', 'buttons', 'cards', 'animations', 'icons', 'gradients'])) themeChecks.push('token groups missing');
  if (typeof themeTokens.contrast?.dark?.inkOnBase !== 'string') themeChecks.push('contrast pairs missing');
  const darkContrast = parseFloat(themeTokens.contrast?.dark?.inkOnBase);
  if (!Number.isNaN(darkContrast) && darkContrast < 4.5) themeChecks.push(`ink/base contrast below AA (${darkContrast})`);
  push('theme-validation', themeChecks.length === 0, themeChecks.join(' | ') || '10 token groups + contrast pairs valid');

  const webChecks = [];
  const bizSections = configs['business.json']?.sections || [];
  for (const sid of sections.enabledIds) {
    if (!bizSections.includes(sid)) webChecks.push(`enabled section "${sid}" missing from business.json`);
  }
  for (const item of configs['navigation.json']?.items || []) {
    if (!bizSections.some((s) => item.href.includes(s)) && !['#home', '#footer', '#contact'].includes(item.href)) webChecks.push(`nav item "${item.label}" has no matching section`);
  }
  if (!configs['hero.json']?.image?.dark) webChecks.push('hero image missing');
  if (!configs['contact.json']?.hours?.length) {
    push('contact-hours', false, 'contact hours missing (business hours not published) — content gap, no fabrication', 'warning');
  }
  if (configs['booking.json']?.enabled === true && !bizSections.includes('reservation')) webChecks.push('booking enabled but reservation section missing');
  if (configs['booking.json']?.enabled === false && bizSections.includes('reservation')) webChecks.push('reservation section present but booking disabled');
  push('website-validation', webChecks.length === 0, webChecks.join(' | ') || 'sections ↔ navigation ↔ booking consistent');

  const seoChecks = [];
  const seo = configs['seo.json'] || {};
  if (!seo.title) seoChecks.push('title missing');
  else if (seo.title.length > 65) seoChecks.push(`title too long (${seo.title.length}/65)`);
  if (!seo.description) seoChecks.push('description missing');
  else if (seo.description.length > 165) seoChecks.push(`description too long (${seo.description.length}/165)`);
  if (!Array.isArray(seo.keywords) || seo.keywords.length === 0) seoChecks.push('keywords missing');
  if (seo.canonical && !/^https?:\/\//.test(seo.canonical)) seoChecks.push('canonical invalid');
  if (!seo.openGraph?.title) seoChecks.push('openGraph incomplete');
  if (!seo.twitter?.card) seoChecks.push('twitter card missing');
  push('seo-validation', seoChecks.length === 0, seoChecks.join(' | ') || 'title/description/keywords/OG/twitter valid');

  const schemaChecks = [];
  if (!structuredData || !Array.isArray(structuredData['@graph']) || structuredData['@graph'].length === 0) schemaChecks.push('structured data graph empty');
  for (const node of structuredData?.['@graph'] || []) {
    if (!node['@type']) schemaChecks.push('node without @type');
    if (!node.name && !node.itemReviewed) schemaChecks.push(`node ${node['@type'] || '?'} missing name`);
  }
  if (structuredData?.schemaType !== configs['seo.json']?.schemaType) schemaChecks.push('schemaType mismatch between structured data and seo.json');
  push('schema-validation', schemaChecks.length === 0, schemaChecks.join(' | ') || 'JSON-LD graph valid');

  const assetChecks = [];
  const known = new Set(manifest?.references || []);
  for (const fileId of CONFIG_IDS) {
    const refs = collectAssetRefs(configs[fileId]);
    for (const ref of refs) {
      if (ref.startsWith('/placeholders/')) {
        if (!known.has(ref)) assetChecks.push(`${fileId} references unknown placeholder ${ref}`);
      } else if (ref.startsWith('/') && !ref.startsWith('//') && !known.has(ref)) {
        assetChecks.push(`${fileId} references asset not in manifest: ${ref}`);
      }
    }
  }
  push('missing-assets', assetChecks.length === 0, assetChecks.join(' | ') || 'all referenced assets declared in manifest');

  const failures = checks.filter((c) => !c.ok && c.level === 'error');
  return {
    passed: failures.length === 0,
    checkCount: checks.length,
    failedChecks: failures,
    checks,
    validation: configValid
  };
}

function collectAssetRefs(obj) {
  const out = [];
  if (Array.isArray(obj)) {
    for (const v of obj) out.push(...collectAssetRefs(v));
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) out.push(...collectAssetRefs(v));
  } else if (typeof obj === 'string' && /^\/(?!\/)[\w./-]+\.[a-z]{2,5}$/i.test(obj)) {
    out.push(obj);
  }
  return out;
}
