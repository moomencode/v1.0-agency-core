// scripts/generate-sitemap.mjs
// ---------------------------------------------------------------------------
// Generates sitemap.xml for the built site from config/seo.json canonical
// URL + config/navigation.json anchors.
//
//   npm run sitemap
//
// Writes dist/sitemap.xml. Paths can be overridden:
//   npm run sitemap -- --base https://cafe-luna.com
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve('.')
const args = process.argv.slice(2)
const baseArg = args.indexOf('--base') !== -1 ? args[args.indexOf('--base') + 1] : null

const seo = JSON.parse(readFileSync(join(ROOT, 'config', 'seo.json'), 'utf8'))
const navigation = JSON.parse(readFileSync(join(ROOT, 'config', 'navigation.json'), 'utf8'))

const base = (baseArg || seo.canonical || '').replace(/\/$/, '')
if (!base) {
  console.error('No base URL found. Set seo.json -> canonical or pass --base https://example.com')
  process.exit(1)
}

const entries = [{ url: base, priority: '1.0' }]
const seen = new Set([''])
for (const item of navigation.items || []) {
  if (item.href && item.href.startsWith('#') && !seen.has(item.href.slice(1))) {
    seen.add(item.href.slice(1))
    entries.push({ url: `${base}${item.href}`, priority: '0.8' })
  }
}

const urls = entries
  .map(
    (e) => `  <url>\n    <loc>${e.url}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
  )
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

const dist = join(ROOT, 'dist')
if (!existsSync(dist)) {
  console.warn('dist/ folder not found — run the build first.')
}
writeFileSync(join(dist, 'sitemap.xml'), xml)
console.log(`sitemap.xml written with ${entries.length} URL(s) -> dist/sitemap.xml`)
