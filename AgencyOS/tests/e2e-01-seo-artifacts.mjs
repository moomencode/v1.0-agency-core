// AgencyOS/tests/e2e-01-seo-artifacts.mjs
// ---------------------------------------------------------------------------
// E2E-01 regression: per-business crawl artifacts (sitemap.xml + robots.txt).
//
// Guards the production fix for the documented-but-missing sitemap step in
// the per-business build path:
//   1. scripts/generate-sitemap.mjs emits dist/sitemap.xml with real
//      absolute canonical URLs (no #fragment entries).
//   2. scripts/generate-sitemap.mjs emits dist/robots.txt pointing at the
//      business's own canonical (/sitemap.xml) — no hardcoded garcia URL.
//   3. scripts/build-business.mjs actually invokes the generator (step 5 of
//      its documented pipeline).
//
// Runs the REAL generator against sandboxed copies of each business config,
// so it exercises the production code path without touching the repo.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GENERATOR = path.join(REPO, 'scripts', 'generate-sitemap.mjs')
const BUSINESSES = path.join(REPO, 'businesses')

let passed = 0
let failed = 0
const fail = (msg) => {
  failed++
  console.log('FAIL ' + msg)
}
const pass = (msg) => {
  passed++
  console.log('PASS ' + msg)
}
const check = (cond, msg) => (cond ? pass(msg) : fail(msg))

function sandboxFor(businessName) {
  const sb = mkdtempSync(path.join(tmpdir(), 'e2e-01-'))
  const configDir = path.join(sb, 'config')
  const distDir = path.join(sb, 'dist')
  mkdirSync(configDir)
  mkdirSync(distDir)
  cpSync(path.join(BUSINESSES, businessName, 'config', 'seo.json'), path.join(configDir, 'seo.json'))
  cpSync(path.join(BUSINESSES, businessName, 'config', 'navigation.json'), path.join(configDir, 'navigation.json'))
  return { sb, configDir, distDir }
}

function runGenerator(sb) {
  return spawnSync(process.execPath, [GENERATOR], { cwd: sb, encoding: 'utf8' })
}

const BUSINESSES_LIST = ['garcia', 'cafe-luna']

const sandboxes = []
try {
  for (const businessName of BUSINESSES_LIST) {
    console.log(`== e2e-01 crawl artifacts: ${businessName} ==`)
    const { sb, distDir } = sandboxFor(businessName)
    sandboxes.push(sb)

    const seo = JSON.parse(readFileSync(path.join(sb, 'config', 'seo.json'), 'utf8'))
    const canonical = String(seo.canonical || '').replace(/\/$/, '')
    const navigation = JSON.parse(readFileSync(path.join(sb, 'config', 'navigation.json'), 'utf8'))

    const res = runGenerator(sb)
    check(res.status === 0, `${businessName}: generator exits 0 (got ${res.status})`)

    const sitemapPath = path.join(distDir, 'sitemap.xml')
    const robotsPath = path.join(distDir, 'robots.txt')
    check(existsSync(sitemapPath), `${businessName}: dist/sitemap.xml exists`)
    check(existsSync(robotsPath), `${businessName}: dist/robots.txt exists`)

    const sitemap = existsSync(sitemapPath) ? readFileSync(sitemapPath, 'utf8') : ''
    const robots = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : ''

    const openTags = (sitemap.match(/<url>/g) || []).length
    const closeTags = (sitemap.match(/<\/url>/g) || []).length
    check(
      sitemap.startsWith('<?xml') && sitemap.includes('urlset') && sitemap.includes('sitemaps.org/schemas/sitemap/0.9') && openTags === closeTags && openTags >= 1,
      `${businessName}: sitemap.xml is well-formed XML with at least one <url>`
    )
    check(sitemap.includes(`<loc>${canonical}</loc>`), `${businessName}: sitemap contains absolute canonical URL ${canonical}`)
    check(!sitemap.includes('#'), `${businessName}: sitemap contains no "#" fragment URLs`)
    for (const item of navigation.items || []) {
      if (item.href && item.href.startsWith('#')) {
        check(!sitemap.includes(item.href), `${businessName}: sitemap excludes navigation anchor "${item.href}"`)
      }
    }
    check(robots.includes('User-agent: *') && robots.includes('Allow: /'), `${businessName}: robots.txt has crawl rules`)
    check(robots.includes(`Sitemap: ${canonical}/sitemap.xml`), `${businessName}: robots.txt points at own sitemap (${canonical}/sitemap.xml)`)

    for (const other of BUSINESSES_LIST) {
      if (other !== businessName) {
        const otherSeo = JSON.parse(readFileSync(path.join(BUSINESSES, other, 'config', 'seo.json'), 'utf8'))
        const otherCanonical = String(otherSeo.canonical || '').replace(/\/$/, '')
        check(!sitemap.includes(otherCanonical), `${businessName}: sitemap contains no other-business URL (${otherCanonical})`)
        check(!robots.includes(otherCanonical), `${businessName}: robots.txt contains no other-business URL (${otherCanonical})`)
      }
    }
  }

  console.log('== e2e-01 build pipeline wiring ==')
  const buildBusiness = readFileSync(path.join(REPO, 'scripts', 'build-business.mjs'), 'utf8')
  check(buildBusiness.includes('generate-sitemap.mjs'), 'build-business.mjs invokes scripts/generate-sitemap.mjs (step 5 implemented)')
  const generatorSource = readFileSync(GENERATOR, 'utf8')
  check(!generatorSource.includes('garcia'), 'generate-sitemap.mjs contains no hardcoded garcia references')
  check(!generatorSource.includes('garcia.example.com'), 'generic crawl-artifact path has no garcia.example.com')
} finally {
  for (const sb of sandboxes) {
    try {
      rmSync(sb, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
}

console.log(`\ne2e-01-seo-artifacts: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
