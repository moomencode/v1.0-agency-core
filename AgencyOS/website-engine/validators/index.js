import { collectNodes, anchorIds, nodeIds } from '../renderer/tree.js';
import { contrastRatio } from '../theme/tokens.js';
import { webError, WEB_CODES } from '../errors.js';

const PAGES_REQUIRED_ON_HOME = ['hero', 'contact', 'footer'];

function checkLinks(page, site) {
  const errors = [];
  const anchors = new Set();
  for (const p of site.pages) {
    for (const n of collectNodes(p, () => true)) {
      if (n.props?.id) anchors.add(`#${n.props.id}`);
    }
  }
  const nodes = collectNodes(page, () => true);
  for (const n of nodes) {
    const href = n.props?.href;
    const src = n.props?.src;
    for (const v of [href, src]) {
      if (!v) continue;
      if (v.startsWith('#') && !anchors.has(v)) {
        errors.push(`broken anchor: ${v}`);
      }
      if (v.startsWith('/')) {
        const a = site.assets.refs.find((r) => r.ref === v);
        if (a && a.status === 'missing') errors.push(`broken asset ref: ${v} (not in manifest)`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function checkSections(page, site, layout) {
  const errors = [];
  const sections = collectNodes(page, (n) => n.type === 'element' && n.props?.['data-section']);
  const ids = sections.map((s) => s.props['data-section']);
  if (page.id === 'home') {
    for (const req of PAGES_REQUIRED_ON_HOME) {
      if (!ids.includes(req)) errors.push(`missing required section: ${req}`);
    }
  }
  if (page.id === 'home' && layout.includesPages.includes('menu') && site.configs?.['menu.json']) {
    if (!site.pages.some((p) => p.id === 'menu')) errors.push('missing menu page (layout requires it)');
  }
  return { ok: errors.length === 0, errors };
}

function checkIds(page) {
  const errors = [];
  const seen = new Set();
  for (const n of collectNodes(page, (n) => n.props?.id)) {
    const id = n.props.id;
    if (seen.has(id)) errors.push(`duplicate id: ${id}`);
    seen.add(id);
  }
  return { ok: errors.length === 0, errors };
}

function checkSeo(page) {
  const errors = [];
  const h = page.head;
  const t = (h.title || '').length;
  if (t < 10 || t > 65) errors.push(`title length ${t} (want 10..65)`);
  if (!h.meta?.description) errors.push('missing meta description');
  else if (h.meta.description.length > 165) errors.push(`meta description too long (${h.meta.description.length})`);
  for (const key of ['og:title', 'og:description', 'og:image', 'og:url']) {
    if (!h.property?.[key]) errors.push(`missing ${key}`);
  }
  if (h.property?.['twitter:card'] !== 'summary_large_image' && h.property?.['twitter:card'] !== 'summary') errors.push('twitter:card missing or invalid');
  if (!/^https?:\/\//.test(h.canonical || '')) errors.push('canonical must be an absolute http(s) URL');
  if (!h.robots) errors.push('missing robots meta');
  return { ok: errors.length === 0, errors };
}

function checkA11y(page) {
  const errors = [];
  const images = collectNodes(page, (n) => n.type === 'element' && n.tag === 'img');
  for (const img of images) {
    const alt = img.props?.alt;
    const hidden = img.props?.ariaHidden === 'true' || img.props?.ariaHidden === true;
    if (!hidden && (alt === undefined || alt === null)) errors.push('img without alt attribute');
  }
  const navs = collectNodes(page, (n) => n.type === 'element' && n.tag === 'nav');
  if (navs.length && !navs.every((n) => n.props?.ariaLabel)) errors.push('nav element without aria-label');
  const buttons = collectNodes(page, (n) => n.type === 'element' && n.tag === 'button');
  for (const b of buttons) {
    const innerText = (b.children || []).some((c) => c.type === 'text' && c.text.trim());
    if (!innerText && !b.props?.ariaLabel && !b.props?.className?.includes('nav__toggle')) errors.push('button without accessible name');
  }
  const headings = collectNodes(page, (n) => n.type === 'element' && /^h[1-6]$/.test(n.tag)).map((n) => n.tag);
  if (!headings.length) errors.push('page has no headings');
  const h1s = headings.filter((t) => t === 'h1');
  if (h1s.length !== 1) errors.push(`expected exactly one h1, found ${h1s.length}`);
  const levels = headings.map((t) => Number(t[1]));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) errors.push(`heading level skipped: h${levels[i - 1]} → h${levels[i]}`);
  }
  return { ok: errors.length === 0, errors };
}

function checkWcag(site) {
  const errors = [];
  const warnings = [];
  for (const mode of ['dark', 'light']) {
    const colors = site.theme.colors[mode];
    if (!colors) continue;
    const inkBase = contrastRatio(colors.ink, colors.base);
    const primaryBase = contrastRatio(colors.primary, colors.base);
    if (inkBase === null || inkBase < 4.5) errors.push(`${mode}: ink/base contrast ${inkBase} < 4.5 (WCAG AA)`);
    if (primaryBase === null || primaryBase < 3.0) warnings.push(`${mode}: primary/base contrast ${primaryBase} < 3.0 (accent — advisory)`);
    if (colors['primary-dark'] && colors.primary) {
      const btn = contrastRatio(colors['primary-dark'], colors.primary);
      if (btn !== null && btn < 3.0) warnings.push(`${mode}: primary button accent contrast ${btn} < 3.0 (decorative accent)`);
    }
  }
  if (!site.theme.typography?.body) errors.push('body font missing from theme');
  return { ok: errors.length === 0, errors, warnings };
}

function checkResponsive(page, site, nav) {
  const errors = [];
  if (page.head.viewport === false) errors.push('missing viewport meta');
  const navItems = nav?.items || [];
  if (navItems.length > 7) errors.push(`navigation has ${navItems.length} items (mobile-safe limit is 7)`);
  const images = collectNodes(page, (n) => n.type === 'element' && n.tag === 'img');
  for (const img of images) {
    if (!img.props?.width && !img.props?.height && !/img--cover|map-frame|menu__dish-img|offer__img/.test(img.props?.className || '')) {
      errors.push('img without dimensions or cover class (layout shift risk)');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateSite(site, { css = '' } = {}) {
  if (!site || !Array.isArray(site.pages)) throw webError(WEB_CODES.INVALID_BUNDLE, 'site model required');
  const layout = site.layout;
  const nav = site.configs?.['navigation.json'] || null;
  const pageChecks = [];
  let failed = false;
  for (const page of site.pages) {
    const checks = [
      { id: 'links', ...checkLinks(page, site) },
      { id: 'sections', ...checkSections(page, site, layout) },
      { id: 'ids', ...checkIds(page) },
      { id: 'seo', ...checkSeo(page) },
      { id: 'a11y', ...checkA11y(page) },
      { id: 'wcag', ...checkWcag(site) },
      { id: 'responsive', ...checkResponsive(page, site, nav) }
    ];
    const pageFailed = checks.some((c) => !c.ok);
    if (pageFailed) failed = true;
    pageChecks.push({ id: page.id, path: page.path, ok: !pageFailed, checks });
  }
  if (css && !css.includes('@media (min-width: 640px)')) {
    pageChecks[0]?.checks.push({ id: 'responsive', ok: false, errors: ['missing 640px breakpoint in CSS'] });
    failed = true;
  }
  const total = pageChecks.reduce((n, p) => n + p.checks.length, 0);
  const failedChecks = pageChecks.flatMap((p) => p.checks).filter((c) => !c.ok);
  return {
    passed: !failed,
    pages: pageChecks,
    totals: { pages: pageChecks.length, checks: total, failed: failedChecks.length },
    failedChecks
  };
}
