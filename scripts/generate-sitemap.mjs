// scripts/generate-sitemap.mjs
// ---------------------------------------------------------------------------
// Generates crawl artifacts for the built site from config/seo.json canonical:
//   dist/sitemap.xml  — real absolute URLs (root + explicitly routable pages)
//   dist/robots.txt   — crawl rules + sitemap pointer for the same canonical
//
//   npm run sitemap
//
// Paths can be overridden:
//   npm run sitemap -- --base https://cafe-luna.com
//
// The production per-business build (npm run build:business -- <name>) runs
// this step automatically after vite build. Anchor-only navigation entries
// (e.g. "#menu") are NOT separate pages and are never emitted as sitemap
// URLs — a single-page site contributes exactly one URL: its canonical.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve('.')
const args = process.argv.slice(2)
const baseArg = args.indexOf('--base') !== -1 ? args[args.indexOf('--base') + 1] : null

const seo = JSON.parse(readFileSync(join(ROOT, 'config', 'seo.json'), 'utf8'))

const base = (baseArg || seo.canonical || '').replace(/\/$/, '')
if (!base) {
  console.error('No base URL found. Set seo.json -> canonical or pass --base https://example.com')
  process.exit(1)
}

const escapeXml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const entries = [{ url: base, priority: '1.0' }]

const urls = entries
  .map(
    (e) => `  <url>\n    <loc>${escapeXml(e.url)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
  )
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n')

const dist = join(ROOT, 'dist')
if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true })
}
writeFileSync(join(dist, 'sitemap.xml'), xml)
writeFileSync(join(dist, 'robots.txt'), robots)
console.log(`sitemap.xml written with ${entries.length} URL(s) -> dist/sitemap.xml`)
console.log(`robots.txt written -> dist/robots.txt (Sitemap: ${base}/sitemap.xml)`)