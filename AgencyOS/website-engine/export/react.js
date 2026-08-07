import { cssVariables, themeBootstrapScript, generateTailwindConfig, generatePostcssConfig } from '../theme/index.js';
import { generateSiteCss } from '../theme/site-css.js';
import { serializeBodyJsx } from '../renderer/serialize-jsx.js';
import { placeholderMap, resolvePlaceholders, placeholderFiles, faviconSvg } from './assets-utils.js';
import { siteScript } from './site-script.js';
import { pngSolid } from './png.js';
import { stableJson } from '../utils.js';
import { escapeHtml } from '../renderer/escape.js';

export function reactFiles(site) {
  const map = placeholderMap(site);
  const home = site.pages.find((p) => p.id === 'home') || site.pages[0];
  const resolved = { ...home, sections: home.sections.map((s) => resolvePlaceholders(s, map)) };
  const bodyJsx = serializeBodyJsx(resolved.sections);
  const head = home.head;
  const fontsUrl = site.theme.typography.fontsUrl || null;
  const bootstrap = themeBootstrapScript(site.theme);
  const css = `${cssVariables(site.theme)}\n\n${generateSiteCss(site.theme)}`;
  const themeColor = themeColorHex(site.theme);

  const metaTags = [];
  if (head.title) metaTags.push(`    <title>${escapeHtml(head.title)}</title>`);
  if (head.meta?.description) metaTags.push(`    <meta name="description" content="${escapeHtml(head.meta.description)}">`);
  if (head.meta?.keywords) metaTags.push(`    <meta name="keywords" content="${escapeHtml(head.meta.keywords)}">`);
  if (head.meta?.robots) metaTags.push(`    <meta name="robots" content="${escapeHtml(head.meta.robots)}">`);
  for (const [prop, content] of Object.entries(head.property || {})) {
    if (content) metaTags.push(`    <meta property="${escapeHtml(prop)}" content="${escapeHtml(content)}">`);
  }
  if (head.canonical) metaTags.push(`    <link rel="canonical" href="${escapeHtml(head.canonical)}">`);

  const files = {};
  files['package.json'] = stableJson({
    name: `${site.businessId}-site`,
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: { '@vitejs/plugin-react': '^4.3.4', vite: '^5.4.11', tailwindcss: '^3.4.17', autoprefixer: '^10.4.20', postcss: '^8.4.49' }
  });

  files['vite.config.js'] = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' }
});
`;

  files['postcss.config.js'] = generatePostcssConfig();
  files['tailwind.config.js'] = generateTailwindConfig(site.theme);

  files['index.html'] = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '  <head>',
    `    <meta charset="UTF-8">`,
    `    <meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    metaTags.join('\n'),
    `    <meta name="theme-color" content="${escapeHtml(themeColor)}">`,
    fontsUrl ? `    <link rel="preconnect" href="https://fonts.googleapis.com">` : '',
    fontsUrl ? `    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` : '',
    fontsUrl ? `    <link href="${escapeHtml(fontsUrl)}" rel="stylesheet">` : '',
    `    <link rel="icon" type="image/svg+xml" href="/favicon.svg">`,
    `    <link rel="manifest" href="/site.webmanifest">`,
    `    <script>${bootstrap}</script>`,
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    '    <script type="module" src="/src/main.jsx"></script>',
    '  </body>',
    '</html>',
    ''
  ].filter((s) => s !== '').join('\n');

  files['src/main.jsx'] = [
    "import { createRoot } from 'react-dom/client';",
    "import App from './App.jsx';",
    "import './site.css';",
    "import './site.js';",
    '',
    "const root = createRoot(document.getElementById('root'));",
    'root.render(<App />);',
    ''
  ].join('\n');

  files['src/App.jsx'] = [
    "export default function App() {",
    "  return (",
    "    <div className=\"site\">",
    bodyJsx,
    "    </div>",
    "  );",
    "}",
    ''
  ].join('\n');

  files['src/site.css'] = `@tailwind base;
@tailwind components;
@tailwind utilities;

${css}
`;

  files['src/site.js'] = siteScript(site.theme);
  files['src/site-data.json'] = stableJson({ businessId: site.businessId, name: site.name, category: site.category, layout: site.layout, configs: site.configs });

  files['public/robots.txt'] = `User-agent: *
Allow: /

${head.canonical ? `Sitemap: ${head.canonical.replace(/\/$/, '')}/sitemap.xml` : ''}
`;
  files['public/sitemap.xml'] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...site.pages.map((p) => `  <url><loc>${escapeHtml(head.canonical ? `${head.canonical.replace(/\/$/, '')}/${p.path}` : p.path)}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n');
  files['public/site.webmanifest'] = stableJson({
    name: site.configs['brand.json']?.name || site.name,
    short_name: site.configs['brand.json']?.shortName || site.name,
    start_url: '/',
    display: 'standalone',
    theme_color: themeColor,
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  });
  files['public/favicon.svg'] = faviconSvg(site);
  files['public/apple-touch-icon.png'] = pngSolid(180, 180, rgbOf(site.theme));
  for (const [rel, content] of Object.entries(placeholderFiles(site, map))) {
    files[`public/${rel}`] = content;
  }
  return files;
}

function rgbOf(theme) {
  const mode = theme.colors[theme.defaultMode] || theme.colors.dark;
  return (mode.primary || '120 140 200').split(/\s+/).slice(0, 3).map(Number);
}

function themeColorHex(theme) {
  return `#${rgbOf(theme).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
