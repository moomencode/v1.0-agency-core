// AgencyOS/tests/p5-agency-site.mjs
// ---------------------------------------------------------------------------
// P5: regression coverage for scripts/agency-site.mjs — the ONE-COMMAND
// production pipeline (GAP 3): ONE INPUT -> ONE COMMAND -> PRODUCTION-READY
// website, reusing the proven business-generate + site mechanisms.
//
// Scope:
//   A. input mode: one command takes a realistic simple-business input
//      (multi-word menu categories, NO booking, NO mapsEmbed) through
//      generation + QA + vite build + sitemap + robots + SSR smoke +
//      byte-exact restore; the generated business and final result are
//      identified in the output; dist artifacts exist.
//      This single run proves BOTH GAP 1 (multi-word categories generate)
//      and GAP 2 (no dead #contact anchor / SSR PASS) end-to-end.
//   B. slug mode: the same one command builds an already-existing business.
//   C. failure propagation: unknown file / unknown slug / invalid input ->
//      non-zero exit, clear FAIL message, no business dir created.
//   D. hygiene: no var/business-generate-* or var/site-snapshot leftovers;
//      live config/ byte-identical throughout.
//
// Conventions: same helpers/PASS-FAIL style as P4; discovered automatically
// by AgencyOS/scripts/regress.mjs. Deterministic, isolated: the slug is
// p5-* and removed in finally; dist/ is gitignored build output.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

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

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: REPO, encoding: 'utf8', ...opts })

const G = (slug) => path.join(REPO, 'businesses', slug)
const SCOPED = ['p5-simple']
const rmScoped = () => {
  for (const slug of SCOPED) rmSync(G(slug), { recursive: true, force: true })
}

const sha256DirFlat = (dir) => {
  const out = {}
  for (const entry of readdirSync(dir).sort()) {
    out[entry] = createHash('sha256').update(readFileSync(path.join(dir, entry))).digest('hex')
  }
  return out
}

// ---------------------------------------------------------------------------
// Fixture: realistic simple business — multi-word menu categories, NO
// booking, NO mapsEmbed, real identity/contact values. Bakery profile plans
// a contact section, so the site must render it (Contact.jsx) and keep the
// #contact anchor — the SSR smoke proves it end-to-end.
// ---------------------------------------------------------------------------
const simpleInput = () => ({
  slug: 'p5-simple',
  name: 'Dawn Sourdough Co',
  type: 'bakery',
  area: 'Zamalek',
  address: '8 Brazil St, Zamalek, Cairo',
  phone: '+20 100 400 6008',
  whatsapp: '+20 100 400 6008',
  canonical: 'https://dawnsourdough.example.eg',
  facebook: 'https://facebook.com/dawnsourdoughco',
  instagram: 'https://instagram.com/dawnsourdoughco',
  hours: [{ days: 'Sunday - Saturday', open: '7:00 AM', close: '8:00 PM' }],
  products: [
    { name: 'Sourdough Loaf', category: 'Artisan Bread', price: 60 },
    { name: 'Rye Loaf', category: 'Artisan Bread', price: 70 },
    { name: 'Cinnamon Roll', category: 'Sweet Pastry', price: 45 },
    { name: 'Cheese Croissant', category: 'Morning Pastry', price: 50 }
  ],
  brand: { tagline: 'Naturally leavened, baked daily', slogan: 'Real bread, real hours', keywords: ['sourdough', 'bakery'] }
})

const writeInput = (name, input) => {
  const file = path.join(REPO, 'var', name)
  writeFileSync(file, JSON.stringify(input, null, 2))
  return file
}

const configHashBefore = sha256DirFlat(path.join(REPO, 'config'))

// ---------------------------------------------------------------------------
// A. Input mode — the full one-command journey for a simple business
// ---------------------------------------------------------------------------
{
  const file = writeInput('p5-input-simple.json', simpleInput())
  try {
    const res = run('node', ['scripts/agency-site.mjs', file])
    check(res.status === 0, 'A: one command (input mode) completes the full pipeline')
    const out = (res.stdout || '') + (res.stderr || '')
    check(/agency:site: p5-simple PASS/.test(out), 'A: output reports the explicit final PASS')
    check(/generated business: Dawn Sourdough Co \(businesses\/p5-simple\/\)/.test(out), 'A: output identifies the generated business')
    check(/SSR SMOKE OK/.test(out), 'A: SSR smoke ran inside the one command')
    check(/PASS section #contact rendered/.test(out), 'A: SSR rendered a real #contact section')
    check(/restored byte-for-byte/.test(out), 'A: byte-exact restore reported')

    const configDir = path.join(G('p5-simple'), 'config')
    check(existsSync(path.join(configDir, 'business.json')), 'A: generated business persists after the one command')
    const business = JSON.parse(readFileSync(path.join(configDir, 'business.json'), 'utf8'))
    check(business.name === 'Dawn Sourdough Co', 'A: generated identity derives from the input')
    const menu = JSON.parse(readFileSync(path.join(configDir, 'menu.json'), 'utf8'))
    const ids = menu.categories.map((c) => c.id)
    check(JSON.stringify(ids) === JSON.stringify(['artisan-bread', 'sweet-pastry', 'morning-pastry']), 'A: multi-word categories generated (GAP 1)')
    check(menu.categories.every((c) => c.count === menu.dishes[c.id].length && c.count > 0), 'A: no empty multi-word categories')
    const navigation = JSON.parse(readFileSync(path.join(configDir, 'navigation.json'), 'utf8'))
    check(
      navigation.items.every((i) => ['#home', '#footer'].includes(i.href) || business.sections.includes(i.href.slice(1))),
      'A: every nav href resolves to a rendered section (no dead anchors — GAP 2)'
    )
    check(navigation.cta.href === '#contact' && business.sections.includes('contact'), 'A: contact section exists and keeps #contact')
    check(existsSync(path.join(REPO, 'dist', 'index.html')), 'A: dist/index.html produced')
    check(existsSync(path.join(REPO, 'dist', 'sitemap.xml')), 'A: dist/sitemap.xml produced')
    check(existsSync(path.join(REPO, 'dist', 'robots.txt')), 'A: dist/robots.txt produced')
    const html = readFileSync(path.join(REPO, 'dist', 'index.html'), 'utf8')
    check(html.includes('Dawn Sourdough Co'), 'A: the built site contains the business identity')
    const sitemap = readFileSync(path.join(REPO, 'dist', 'sitemap.xml'), 'utf8')
    check(sitemap.includes('https://dawnsourdough.example.eg'), 'A: sitemap uses the business canonical')
    const robots = readFileSync(path.join(REPO, 'dist', 'robots.txt'), 'utf8')
    check(/Sitemap: https:\/\/dawnsourdough\.example\.eg\/sitemap\.xml/.test(robots), 'A: robots.txt points at the business sitemap')
  } finally {
    rmSync(file, { force: true })
    rmScoped()
  }
}

// ---------------------------------------------------------------------------
// B. Slug mode — the same one command builds an existing business
// ---------------------------------------------------------------------------
{
  const file = writeInput('p5-input-simple.json', simpleInput())
  try {
    const gen = run('node', ['scripts/business-generate.mjs', file])
    check(gen.status === 0, 'B: setup generation for slug mode succeeds')
    const res = run('node', ['scripts/agency-site.mjs', 'p5-simple'])
    check(res.status === 0, 'B: one command (slug mode) builds an existing business')
    const out = (res.stdout || '') + (res.stderr || '')
    check(/agency:site: p5-simple PASS/.test(out), 'B: slug mode reports the explicit final PASS')
    check(/SSR SMOKE OK/.test(out), 'B: slug mode ran SSR smoke')
  } finally {
    rmSync(file, { force: true })
    rmScoped()
  }
}

// ---------------------------------------------------------------------------
// C. Failure propagation — non-zero exits, clear messages, no side effects
// ---------------------------------------------------------------------------
{
  const missing = run('node', ['scripts/agency-site.mjs', path.join(REPO, 'var', 'does-not-exist.json')])
  check(missing.status !== 0, 'C: missing input file exits non-zero')
  check(/(agency:site: FAIL|business:generate: FAIL)/.test((missing.stdout || '') + (missing.stderr || '')), 'C: missing input file produces a clear FAIL message')

  const unknown = run('node', ['scripts/agency-site.mjs', 'zzz-no-such-business'])
  check(unknown.status !== 0, 'C: unknown slug exits non-zero')
  check(/agency:site: FAIL/.test((unknown.stdout || '') + (unknown.stderr || '')), 'C: unknown slug produces a clear FAIL message')

  const bad = simpleInput()
  delete bad.name
  const badFile = writeInput('p5-input-bad.json', bad)
  try {
    const res = run('node', ['scripts/agency-site.mjs', badFile])
    check(res.status !== 0, 'C: input missing a required field exits non-zero')
    check(/missing required field/.test((res.stdout || '') + (res.stderr || '')), 'C: the generator error message propagates')
    check(!existsSync(G('p5-simple')), 'C: failed input leaves no business dir')
  } finally {
    rmSync(badFile, { force: true })
  }
}

// ---------------------------------------------------------------------------
// D. Hygiene — no temp leftovers, live config/ byte-identical
// ---------------------------------------------------------------------------
{
  const varEntries = readdirSync(path.join(REPO, 'var'))
  check(!varEntries.some((n) => n.startsWith('business-generate-')), 'D: no var/business-generate-* temp dirs remain')
  check(!varEntries.includes('site-snapshot'), 'D: no var/site-snapshot remains')
  const afterAll = sha256DirFlat(path.join(REPO, 'config'))
  const same = Object.keys(configHashBefore).every((k) => configHashBefore[k] === afterAll[k])
  check(same && Object.keys(configHashBefore).length === Object.keys(afterAll).length, 'D: live config/ byte-identical after every wrapper run (restore verified)')
}

console.log(`\nP5 agency-site wrapper: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1