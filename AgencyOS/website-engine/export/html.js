import { escapeHtml } from '../renderer/escape.js';
import { renderDocument, serializeBodyHtml } from '../renderer/index.js';
import { cssVariables, themeBootstrapScript } from '../theme/css.js';
import { generateSiteCss } from '../theme/site-css.js';
import { assetReport } from '../assets/index.js';
import { placeholderMap, resolvePlaceholders, placeholderFiles, faviconSvg } from './assets-utils.js';
import { siteScript } from './site-script.js';
import { pngSolid } from './png.js';
import { stableJson } from '../utils.js';

export function staticFiles(site) {
  const cssVars = cssVariables(site.theme);
  const siteCss = generateSiteCss(site.theme);
  const css = `${cssVars}\n\n${siteCss}`;
  const bootstrap = themeBootstrapScript(site.theme);
  const script = siteScript(site.theme);
  const map = placeholderMap(site);
  const canonical = site.configs['seo.json']?.canonical || null;

  const files = {};
  for (const page of site.pages) {
    const resolved = { ...page, sections: page.sections.map((s) => resolvePlaceholders(s, map)) };
    files[page.path] = renderDocument({
      head: page.head,
      bodyNodes: resolved.sections,
      css,
      inlineScript: `${bootstrap}\n${script}`,
      fontsUrl: site.theme.typography.fontsUrl || null
    });
  }

  const base = canonical ? canonical.replace(/\/$/, '') : '';
  files['robots.txt'] = [
    'User-agent: *',
    'Allow: /',
    '',
    base ? `Sitemap: ${base}/sitemap.xml` : '',
    ''
  ].filter(Boolean).join('\n');

  const pageUrls = site.pages.map((p) => base ? `${base}/${p.path}` : p.path);
  files['sitemap.xml'] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...site.pages.map((p) => `  <url><loc>${escapeHtml(base ? `${base}/${p.path}` : p.path)}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n');

  const themeColor = primaryHex(site.theme);
  files['site.webmanifest'] = stableJson({
    name: site.configs['brand.json']?.name || site.name,
    short_name: site.configs['brand.json']?.shortName || site.name,
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: themeColor,
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  });

  files['favicon.svg'] = faviconSvg(site);
  files['apple-touch-icon.png'] = pngSolid(180, 180, rgbOf(site.theme));
  Object.assign(files, placeholderFiles(site, map));
  files['asset-report.md'] = assetReport(site);
  return files;
}

export function staticChecksumOrder(site) {
  return Object.keys(staticFiles(site)).sort();
}

function primaryHex(theme) {
  const c = rgbOf(theme);
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function rgbOf(theme) {
  const mode = theme.colors[theme.defaultMode] || theme.colors.dark;
  return (mode.primary || '120 140 200').split(/\s+/).slice(0, 3).map(Number);
}

export function staticPreviewHtml(site) {
  const files = staticFiles(site);
  return files['index.html'] || '';
}
