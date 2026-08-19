// AgencyOS/tests/p6-features.mjs
// ---------------------------------------------------------------------------
// P6: regression coverage for the generic, config-driven Features section
// (src/sections/Features.jsx) — fixes the dead #features anchors that the
// gym/tailor/shop/pharmacy/other profiles previously generated with no
// engine component behind them:
//
//   [WARN] business.json: section "features" is not registered in
//          src/App.jsx SECTION_REGISTRY and will not render
//   SSR FAIL: section #features not found in rendered HTML
//
// Scope:
//   A. component + registration: Features.jsx exists, is registered in
//      src/App.jsx SECTION_REGISTRY and scripts/schemas.mjs MODULE_SECTIONS,
//      is config-driven (SITE.features), has the exact section id "features",
//      and contains NO business-specific conditionals.
//   B. real gym pipeline (one command): exit 0, explicit final PASS, the SSR
//      smoke renders #features, the unregistered-section warning is gone,
//      every nav href resolves to a rendered section (no dead anchors), and
//      generated features.json carries the input strengths.
//   C. real tailor pipeline (one command): same #features rendering, no
//      cross-business leaks.
//   D. regressions: garcia + cafe-luna one-command builds still PASS and
//      still do NOT render a features section (restaurant/cafe profiles do
//      not plan features) — behavior of existing businesses unchanged.
//   E. determinism: two identical gym runs produce byte-identical generated
//      configs and dist artifacts.
//
// Conventions: same helpers/PASS-FAIL style as P4/P5; discovered
// automatically by AgencyOS/scripts/regress.mjs. Deterministic, isolated:
// slugs are p6-* and removed in finally; dist/ is gitignored build output.
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
const SCOPED = ['p6-gym', 'p6-tailor']
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
const hashFile = (file) =>
  existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null

// ---------------------------------------------------------------------------
// Fixtures: realistic gym + tailor inputs. Both profiles plan a "features"
// section, so each input must include strengths (features data source).
// ---------------------------------------------------------------------------
const gymInput = () => ({
  slug: 'p6-gym',
  name: 'Iron Peak Gym',
  type: 'gym',
  area: 'New Cairo',
  address: '12 Fifth Settlement, New Cairo, Cairo',
  phone: '+20 100 200 3004',
  whatsapp: '+20 100 200 3004',
  canonical: 'https://ironpeakgym.example.eg',
  facebook: 'https://facebook.com/ironpeakgym',
  instagram: 'https://instagram.com/ironpeakgym',
  hours: [{ days: 'Saturday - Thursday', open: '6:00 AM', close: '11:00 PM' }],
  services: [
    { name: 'Personal Training', price: 500 },
    { name: 'Group Classes', price: 300 }
  ],
  strengths: [
    { id: 's1', title: 'Free Weights Zone', evidence: 'Full squat racks and deadlift platforms' },
    { id: 's2', title: 'Group Classes', evidence: 'Daily HIIT and spin sessions' },
    { id: 's3', title: 'Certified Coaches', evidence: 'International coaching certifications' }
  ],
  brand: { tagline: 'Train harder, live stronger', slogan: 'Your peak is waiting', keywords: ['gym', 'fitness', 'training'] }
})

const tailorInput = () => ({
  slug: 'p6-tailor',
  name: 'Nile Tailors',
  type: 'tailor',
  area: 'Maadi',
  address: '3 Rd 9, Maadi, Cairo',
  phone: '+20 100 500 6007',
  whatsapp: '+20 100 500 6007',
  canonical: 'https://niletailors.example.eg',
  facebook: 'https://facebook.com/niletailors',
  instagram: 'https://instagram.com/niletailors',
  hours: [{ days: 'Saturday - Thursday', open: '10:00 AM', close: '8:00 PM' }],
  services: [
    { name: 'Custom Suits', price: 2500 },
    { name: 'Alterations', price: 150 }
  ],
  strengths: [
    { id: 's1', title: 'Master Tailors', evidence: '20 years of bespoke tailoring' },
    { id: 's2', title: 'Perfect Fit Guarantee', evidence: 'Free adjustments until it fits' },
    { id: 's3', title: 'Premium Fabrics', evidence: 'Imported Italian and Egyptian cottons' }
  ],
  brand: { tagline: 'Cut to perfection, stitched with care', slogan: 'Wear the difference', keywords: ['tailor', 'suits', 'alterations'] }
})

const writeInput = (name, input) => {
  const file = path.join(REPO, 'var', name)
  writeFileSync(file, JSON.stringify(input, null, 2))
  return file
}

// ---------------------------------------------------------------------------
// A. Component + registration (source-level evidence)
// ---------------------------------------------------------------------------
{
  const feat = path.join(REPO, 'src', 'sections', 'Features.jsx')
  check(existsSync(feat), 'A: src/sections/Features.jsx exists')
  const src = existsSync(feat) ? readFileSync(feat, 'utf8') : ''
  check(/import \{ SITE \} from '\.\.\/core\/site'/.test(src) && /\{ features \} = SITE/.test(src), 'A: Features.jsx is config-driven (reads SITE.features)')
  check(/<section id="features"/.test(src), 'A: rendered section id is exactly "features" (matches section catalog anchor)')
  check(!/gym|tailor|garcia|cafe|luna|bakery|shop|pharmacy|iron|nile/i.test(src), 'A: no business-specific conditionals/hardcoded identity in Features.jsx')

  const app = readFileSync(path.join(REPO, 'src', 'App.jsx'), 'utf8')
  check(/import Features from '\.\/sections\/Features'/.test(app), 'A: Features imported in src/App.jsx')
  check(/features: Features/.test(app), 'A: features mapped in SECTION_REGISTRY (src/App.jsx)')

  const schemas = readFileSync(path.join(REPO, 'scripts', 'schemas.mjs'), 'utf8')
  check(/'features'/.test(schemas.slice(schemas.indexOf('MODULE_SECTIONS'))), 'A: "features" registered in MODULE_SECTIONS (scripts/schemas.mjs)')
}

// ---------------------------------------------------------------------------
// B. Real gym pipeline — one command, first run (evidence)
// ---------------------------------------------------------------------------
let gymConfigHash = null
let gymDistHash = null
{
  const file = writeInput('p6-input-gym.json', gymInput())
  try {
    const res = run('node', ['scripts/agency-site.mjs', file])
    const out = (res.stdout || '') + (res.stderr || '')
    check(res.status === 0, 'B: one command (input mode) passes for the gym business')
    check(/agency:site: p6-gym PASS/.test(out), 'B: explicit final PASS reported')
    check(/PASS section #features rendered/.test(out), 'B: SSR smoke renders the #features section')
    check(!/SSR FAIL/.test(out), 'B: no SSR failure')
    check(!/not registered in src\/App\.jsx SECTION_REGISTRY/.test(out), 'B: unregistered-section warning is gone (features registered)')

    const bizDir = G('p6-gym')
    const business = JSON.parse(readFileSync(path.join(bizDir, 'config', 'business.json'), 'utf8'))
    check(business.sections.includes('features'), 'B: generated business plans a features section')

    const navigation = JSON.parse(readFileSync(path.join(bizDir, 'config', 'navigation.json'), 'utf8'))
    const hero = JSON.parse(readFileSync(path.join(bizDir, 'config', 'hero.json'), 'utf8'))
    const refs = [
      ...(navigation.items || []).map((i) => i.href),
      ...(navigation.cta ? [navigation.cta.href] : []),
      hero.ctaPrimary ? hero.ctaPrimary.href : null
    ].filter((h) => h && h.startsWith('#'))
    check(
      refs.length > 0 &&
        refs.every((h) => business.sections.includes(h.slice(1)) || (h === '#home' && business.sections.some((s) => s === 'navbar' || s === 'hero'))),
      `B: every #anchor in the generated config resolves to a planned section (${refs.join(', ')})`
    )

    const features = JSON.parse(readFileSync(path.join(bizDir, 'config', 'features.json'), 'utf8'))
    const titles = (features.items || []).map((i) => i.title)
    check(
      JSON.stringify(titles) === JSON.stringify(['Free Weights Zone', 'Group Classes', 'Certified Coaches']),
      'B: generated features.json carries the input strengths (1:1, no invention)'
    )

    gymConfigHash = sha256DirFlat(path.join(bizDir, 'config'))
    gymDistHash = {
      index: hashFile(path.join(REPO, 'dist', 'index.html')),
      sitemap: hashFile(path.join(REPO, 'dist', 'sitemap.xml')),
      robots: hashFile(path.join(REPO, 'dist', 'robots.txt'))
    }
  } finally {
    rmSync(file, { force: true })
  }
}

// ---------------------------------------------------------------------------
// E. Determinism — second build of the SAME generated business (slug mode),
// byte-for-byte. Input-mode regeneration is intentionally refused by the
// generator (existing-business protection), so the deterministic repeat is:
// build the same generated business again and compare every artifact.
// ---------------------------------------------------------------------------
{
  const res = run('node', ['scripts/agency-site.mjs', 'p6-gym'])
  const out = (res.stdout || '') + (res.stderr || '')
  check(res.status === 0, 'E: second build of the same generated gym passes (slug mode)')
  check(/agency:site: p6-gym PASS/.test(out), 'E: repeated build reports the explicit final PASS')
  const after = sha256DirFlat(path.join(G('p6-gym'), 'config'))
  const same = gymConfigHash && Object.keys(gymConfigHash).every((k) => gymConfigHash[k] === after[k])
  check(!!gymConfigHash && same && Object.keys(after).length === Object.keys(gymConfigHash).length, 'E: generated gym config tree byte-identical after the repeated build')
  check(
    gymDistHash && hashFile(path.join(REPO, 'dist', 'index.html')) === gymDistHash.index,
    'E: dist/index.html byte-identical across builds'
  )
  check(
    gymDistHash && hashFile(path.join(REPO, 'dist', 'sitemap.xml')) === gymDistHash.sitemap && hashFile(path.join(REPO, 'dist', 'robots.txt')) === gymDistHash.robots,
    'E: dist/sitemap.xml + robots.txt byte-identical across builds'
  )
}

// ---------------------------------------------------------------------------
// C. Real tailor pipeline — second profile with a features section
// ---------------------------------------------------------------------------
{
  const file = writeInput('p6-input-tailor.json', tailorInput())
  try {
    const res = run('node', ['scripts/agency-site.mjs', file])
    const out = (res.stdout || '') + (res.stderr || '')
    check(res.status === 0, 'C: one command (input mode) passes for the tailor business')
    check(/PASS section #features rendered/.test(out), 'C: SSR smoke renders #features for the tailor')
    check(/SSR SMOKE OK/.test(out) && !/SSR FAIL/.test(out), 'C: tailor SSR smoke fully OK')
    check(!/(identity leaked|canonical leaked)/.test(out), 'C: no cross-business leakage between generated businesses')
  } finally {
    rmSync(file, { force: true })
  }
}

// ---------------------------------------------------------------------------
// D. Regressions — existing businesses unchanged (no features section)
// ---------------------------------------------------------------------------
{
  const res = run('node', ['scripts/agency-site.mjs', 'garcia'])
  const out = (res.stdout || '') + (res.stderr || '')
  check(res.status === 0, 'D: garcia one-command build still passes')
  check(/SSR SMOKE OK/.test(out) && !/SSR FAIL/.test(out), 'D: garcia SSR smoke OK (unchanged)')
  check(!/section #features rendered/.test(out), 'D: garcia does NOT render a features section (restaurant profile — unchanged behavior)')

  const res2 = run('node', ['scripts/agency-site.mjs', 'cafe-luna'])
  const out2 = (res2.stdout || '') + (res2.stderr || '')
  check(res2.status === 0, 'D: cafe-luna one-command build still passes')
  check(/SSR SMOKE OK/.test(out2) && !/SSR FAIL/.test(out2), 'D: cafe-luna SSR smoke OK (unchanged)')
  check(!/section #features rendered/.test(out2), 'D: cafe-luna does NOT render a features section (unchanged behavior)')
}

// ---------------------------------------------------------------------------
// Hygiene — disposable generated businesses removed
// ---------------------------------------------------------------------------
rmScoped()
{
  const leftovers = SCOPED.filter((slug) => existsSync(G(slug)))
  check(leftovers.length === 0, 'H: disposable p6 businesses cleaned up')
}

console.log(`\nP6 features section: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
