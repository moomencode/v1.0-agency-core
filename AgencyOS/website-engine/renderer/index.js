import { el } from './tree.js';
import { serializeTreeHtml, serializeBodyHtml } from './serialize-html.js';
import { serializeBodyJsx } from './serialize-jsx.js';
import { escapeHtml } from './escape.js';

export { el, text, icon, stars, collectNodes, collectText, nodeIds, anchorIds } from './tree.js';
export { serializeTreeHtml, serializeBodyHtml } from './serialize-html.js';
export { serializeBodyJsx } from './serialize-jsx.js';

export function renderDocument({ head = {}, bodyNodes = [], css = '', inlineScript = '', fontsUrl = null }) {
  const meta = [];
  if (head.title) meta.push(`<title>${escapeHtml(head.title)}</title>`);
  for (const [name, content] of Object.entries(head.meta || {})) {
    if (content) meta.push(`<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">`);
  }
  for (const [prop, content] of Object.entries(head.property || {})) {
    if (content) meta.push(`<meta property="${escapeHtml(prop)}" content="${escapeHtml(content)}">`);
  }
  if (head.canonical) meta.push(`<link rel="canonical" href="${escapeHtml(head.canonical)}">`);
  if (head.robots) meta.push(`<meta name="robots" content="${escapeHtml(head.robots)}">`);
  if (head.viewport === false) { /* skip */ } else meta.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  if (head.themeColor) meta.push(`<meta name="theme-color" content="${escapeHtml(head.themeColor)}">`);
  const fontLink = fontsUrl ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="${escapeHtml(fontsUrl)}" rel="stylesheet">` : '';
  const style = css ? `<style>\n${css}\n</style>` : '';
  const script = inlineScript ? `<script>\n${inlineScript}\n</script>` : '';
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    meta.join('\n'),
    fontLink,
    style,
    script,
    '</head>',
    '<body>',
    serializeBodyHtml(bodyNodes),
    '</body>',
    '</html>',
    ''
  ].filter((s) => s !== '').join('\n');
}
