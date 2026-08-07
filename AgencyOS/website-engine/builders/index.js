import { SECTION_MAP, SECTION_DEFS, SECTION_BUILDERS } from '../sections/index.js';
import { layoutFor, layoutIdFor } from '../layouts/index.js';
import { parseTheme } from '../theme/index.js';
import { resolveAssets } from '../assets/index.js';
import { el, text } from '../renderer/tree.js';
import { webError, WEB_CODES } from '../errors.js';
import { buildHead } from './head.js';

const REQUIRED_CONFIGS = ['theme.json', 'business.json', 'brand.json', 'hero.json', 'navigation.json', 'seo.json', 'contact.json', 'footer.json'];

export function buildSite(configs, { manifest = null, structuredData = null, overrideLayout = null } = {}) {
  if (!configs || typeof configs !== 'object') throw webError(WEB_CODES.INVALID_BUNDLE, 'config bundle required');
  const missing = REQUIRED_CONFIGS.filter((id) => !configs[id]);
  if (missing.length) throw webError(WEB_CODES.MISSING_CONFIG, `missing configs: ${missing.join(', ')}`);

  const theme = parseTheme(configs['theme.json']);
  const business = configs['business.json'];
  const brand = configs['brand.json'];
  const category = business.type || 'other';
  const layoutId = layoutIdFor(category, overrideLayout);
  const layout = layoutFor(category, overrideLayout);

  const ctx = {
    configs,
    theme,
    layout,
    site: {
      businessId: business.id || manifest?.businessId || brand.name || 'site',
      name: business.name || brand.name || 'Business',
      category,
      locale: business.locale || 'en'
    }
  };

  const sectionIds = composeSectionIds(business.sections, layout);
  const sections = sectionIds
    .map((id) => buildSection(id, ctx))
    .filter(Boolean);

  const assets = resolveAssets(configs, { manifest });

  const seo = configs['seo.json'] || {};
  const pages = buildPages({ sections, ctx, seo });

  return {
    engineVersion: '1.0',
    businessId: ctx.site.businessId,
    name: ctx.site.name,
    category,
    configs,
    layout: { id: layoutId, label: layout.label, ...layout },
    theme,
    assets,
    structuredData: structuredData || null,
    pages,
    checksums: {}
  };
}

function composeSectionIds(enabledList, layout) {
  const ordered = [];
  const seen = new Set();
  const push = (id) => {
    if (!id || seen.has(id) || !SECTION_DEFS[id]) return;
    seen.add(id);
    ordered.push(id);
  };
  push('navbar');
  push('hero');
  for (const sid of Array.isArray(enabledList) ? enabledList : []) {
    const mapped = SECTION_MAP[sid] || sid;
    push(mapped);
  }
  push('about');
  push('products');
  push('pricing');
  push('team');
  if (!seen.has('contact')) push('contact');
  for (const extra of layout.extraBeforeFooter || []) push(extra);
  push('footer');
  return ordered;
}

function buildSection(id, ctx) {
  const def = SECTION_DEFS[id];
  if (!def) return null;
  const builder = SECTION_BUILDERS[id];
  if (!builder) return null;
  const missingData = def.configFiles.every((f) => !ctx.configs[f]);
  if (missingData) return null;
  let node = null;
  try {
    node = builder(ctx);
  } catch {
    return null;
  }
  if (!node) return null;
  if (node.type === 'element' && node.props) {
    node.props['data-section'] = node.props['data-section'] || id;
    const index = ctx._sectionIndex || 0;
    ctx._sectionIndex = index + 1;
    if (node.tag === 'section' && !node.props.variant && ctx.layout.sectionAltEvery && index % ctx.layout.sectionAltEvery === ctx.layout.sectionAltEvery - 1) {
      node.props.className = `${node.props.className || 'sec'} sec--alt`;
    }
  }
  return node;
}

export function buildPages({ sections, ctx, seo }) {
  const head = (pageId) => buildHead(seo, { pageId, name: ctx.site.name });
  const navbar = sections.find((s) => s.props?.['data-section'] === 'navbar') || null;
  const footer = sections.find((s) => s.props?.['data-section'] === 'footer') || null;
  const content = sections.filter((s) => !['navbar', 'footer'].includes(s.props?.['data-section']));
  const homeSections = [navbar, ...content, footer].filter(Boolean);

  const menuEnabled = ctx.configs['menu.json'] && ctx.layout.includesPages.includes('menu');
  const pageTitle = (t) => el('h1', { className: 'page-title' }, [text(t)]);
  const contactPageSections = [
    navbar,
    pageTitle(ctx.configs['contact.json']?.heading?.title || 'Contact Us'),
    content.find((s) => s.props?.['data-section'] === 'contact') || null,
    content.find((s) => s.props?.['data-section'] === 'location') || null,
    footer
  ].filter(Boolean);

  const menuSections = [
    navbar,
    pageTitle(ctx.configs['menu.json']?.heading?.title || 'Menu'),
    content.find((s) => s.props?.['data-section'] === 'menu') || null,
    content.find((s) => s.props?.['data-section'] === 'cta') || null,
    footer
  ].filter(Boolean);

  const pages = [
    { id: 'home', path: 'index.html', route: '/', sections: homeSections, head: head('home') }
  ];
  if (menuEnabled && menuSections.length > 2) {
    pages.push({ id: 'menu', path: 'menu.html', route: '/menu', sections: menuSections, head: head('menu') });
  }
  pages.push({ id: 'contact', path: 'contact.html', route: '/contact', sections: contactPageSections, head: head('contact') });
  return pages;
}
