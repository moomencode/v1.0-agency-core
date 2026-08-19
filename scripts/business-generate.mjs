// scripts/business-generate.mjs
// ---------------------------------------------------------------------------
// Phase 2: Business Input -> Config Automation.
//
//   npm run business:generate -- <input.json>
//
// One organized, business-agnostic Business Input becomes a full
// businesses/<slug>/ folder (19 config files + neutral placeholder assets),
// validated by the root QA gate before becoming a Phase-1-ready business.
//
// Orchestrates EXISTING AgencyOS pipeline modules (nothing reimplemented,
// nothing modified):
//   normalizeDossier -> planSections -> generateThemeTokens -> themeJsonFromTokens
//   -> generateAssetsManifest -> buildConfigs (AgencyOS/pipeline/*)
//
// Truthfulness contract (step 4):
//   - Required input fields (name, type, area, address, phone, whatsapp,
//     facebook, instagram, canonical) are validated up front — missing =
//     explicit "missing required field" error. NO fields are invented.
//   - Content-driven sections (menu/gallery/offers/services/stats/
//     testimonials/features/reservation/faq) follow the pipeline's own rule:
//     enabled ONLY when the input provides data (planSections).
//   - Adapter-specific documented rules:
//       * 'location' section is DISABLED when input has no mapsEmbed URL
//         (root QA requires mapsEmbed when location is enabled).
//       * Booking/reservation only when input provides a booking signal.
//   - Market defaults are the pipeline's documented constants (EGP, decimals 0,
//     phoneDigits 11, locale en, languages [en, ar] — same as the flagship
//     garcia business); input may override currency / phoneDigits / locale /
//     languages and those land in business.json only.
//
// Placeholder gate (step 4b, P2): validation is layered —
//   1. missing required fields -> explicit error (unchanged),
//   2. syntactically invalid -> explicit error (unchanged),
//   3. obvious placeholder/fake commercial values (reserved demo domains such
//      as example.com / .invalid / *.test / paths with "yourbusiness" or
//      "placeholder" tokens; synthetic phones such as all-zero, trailing-zero
//      or repeated-digit patterns) -> explicit error, UNLESS the input is
//      explicitly marked "demo": true (the ONLY way the shipped example
//      fixture may pass; the flag must be present and boolean true).
//   Rules live once, in AgencyOS/pipeline/placeholder-checks.mjs, and are
//   shared by the P2 test suite. Real-world values (e.g. a genuine domain
//   containing "test"/"example") are never rejected.
//
// Determinism (step 7): all pipeline stages are pure derivations (no RNG in
// this path); every file is written with stableJson (sorted keys, no
// timestamps). Identical input yields byte-identical output.
//
// Atomicity (step 9): generation happens in var/business-generate-<pid>/;
// the root QA gate (scripts/qa.mjs --config-dir <generated>/config) is run
// DIRECTLY against the generated configs, without touching the active
// config/ tree — a hard kill can never leave the active config broken. The
// folder is moved into businesses/<slug> ONLY after QA passes. Any failure
// removes the temp tree — nothing is left behind and businesses/ is never
// touched until the final atomic rename.
//
// Existing-business protection (step 8): businesses/<slug> already exists ->
// refused (garcia / cafe-luna / _template can never be overwritten).
// ---------------------------------------------------------------------------

import { existsSync, readdirSync, mkdirSync, rmSync, renameSync, readFileSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { spawnSync } from 'child_process'
import { deflateSync } from 'zlib'

import { normalizeDossier } from '../AgencyOS/pipeline/normalize.js'
import { planSections } from '../AgencyOS/pipeline/sections.js'
import { generateThemeTokens, themeJsonFromTokens } from '../AgencyOS/pipeline/theme.js'
import { generateAssetsManifest } from '../AgencyOS/pipeline/manifest.js'
import { buildConfigs } from '../AgencyOS/pipeline/config/index.js'
import { stableJson, slugify, ensureArray } from '../AgencyOS/pipeline/utils.js'
import { REQUIRED_FILES } from './schemas.mjs'
import { placeholderErrors } from '../AgencyOS/pipeline/placeholder-checks.mjs'

const ROOT = resolve('.')
const BUSINESSES = join(ROOT, 'businesses')
const WORK = join(ROOT, 'var', `business-generate-${process.pid}`)

const fail = (msg) => {
  console.error(`\nbusiness:generate: FAIL — ${msg}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. CLI + input load
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
if (argv.length !== 1) {
  console.error('Usage: npm run business:generate -- <input.json>')
  console.error('Example: npm run business:generate -- scripts/business-input.example.json')
  process.exit(1)
}
const inputPath = resolve(argv[0])
if (!existsSync(inputPath)) fail(`input file not found: ${argv[0]}`)

let input
try {
  input = JSON.parse(readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, ''))
} catch (err) {
  fail(`input JSON is invalid (${err.message})`)
}
if (!input || typeof input !== 'object' || Array.isArray(input)) fail('input must be a JSON object')

// ---------------------------------------------------------------------------
// 2. Input validation (no invented facts — every rule below guards the
//    no-invention invariant; pipeline market defaults are documented above).
// ---------------------------------------------------------------------------
const validate = (cond, msg) => {
  if (!cond) fail(msg)
  return true
}
const requiredString = (obj, key, what) => {
  validate(
    typeof obj[key] === 'string' && obj[key].trim().length > 0,
    `missing required field "${key}" — ${what} must be provided in the business input`
  )
}
const optionalString = (obj, key) => (typeof obj[key] === 'string' && obj[key].trim() ? obj[key].trim() : null)

requiredString(input, 'name', 'business name')
requiredString(input, 'type', 'business category (restaurant, cafe, gym, clinic, barber, salon, bakery, shop, pharmacy, tailor, other)')
requiredString(input, 'area', 'neighborhood/city')
requiredString(input, 'address', 'street address')
requiredString(input, 'phone', 'phone number')
requiredString(input, 'whatsapp', 'WhatsApp number')
requiredString(input, 'facebook', 'Facebook page URL')
requiredString(input, 'instagram', 'Instagram page URL')
requiredString(input, 'canonical', 'site canonical URL (https://…)')
validate(/^https?:\/\//i.test(input.canonical), '"canonical" must be an absolute http(s) URL')

for (const k of ['facebook', 'instagram']) {
  validate(/^https?:\/\//i.test(input[k]), `"${k}" must be an absolute http(s) URL`)
}
for (const k of ['phone', 'whatsapp']) {
  validate(/^\+?[\d\s()-]{6,20}$/.test(String(input[k])), `"${k}" must look like a phone number (digits, +, spaces, dashes)`)
}
if (input.slug !== undefined) validate(/^[a-z0-9][a-z0-9-]*$/.test(input.slug), '"slug" must match [a-z0-9][a-z0-9-]*')
if (input.mapsEmbed !== undefined) validate(/^https?:\/\//i.test(input.mapsEmbed), '"mapsEmbed" must be an absolute http(s) URL')
if (input.email !== undefined) validate(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email), '"email" is not a valid email address')

const TIME_RE = /^(1[0-2]|0?[1-9]):[0-5]\d\s?(AM|PM|am|pm)$/
for (const h of ensureArray(input.hours)) {
  validate(typeof h.days === 'string' && h.days.trim(), 'each hours entry needs "days" (e.g. "Sunday - Saturday")')
  validate(TIME_RE.test(String(h.open || '')) && TIME_RE.test(String(h.close || '')), `hours entry "${h.days || '?'}" needs open/close like "9:00 AM" / "9:00 PM"`)
}

const slug = input.slug || slugify(input.name)
validate(new RegExp('^[a-z0-9][a-z0-9-]*$').test(slug), `name slugified to invalid "${slug}" — provide a valid "slug"`)
if (existsSync(join(BUSINESSES, slug))) {
  console.error(`business:generate: FAIL — businesses/${slug} already exists (overwrite refused)`)
  console.error('  Existing business protection: choose a different slug or name.')
  process.exit(1)
}

for (const p of ensureArray(input.products)) {
  validate(typeof p.name === 'string' && p.name.trim(), 'every product needs a non-empty "name"')
  validate(typeof p.category === 'string' && p.category.trim(), `product "${p.name}" needs a "category" (drives menu categories)`)
  validate(typeof p.price === 'number' && p.price > 0, `product "${p.name}" needs a numeric "price" > 0`)
}
for (const r of ensureArray(input.reviews)) {
  validate(typeof r.text === 'string' && r.text.trim(), 'every review needs a non-empty "text"')
  validate(r.rating === undefined || (typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5), 'review rating must be a number between 1 and 5')
}
if (input.rating !== undefined) validate(typeof input.rating === 'number' && input.rating >= 0 && input.rating <= 5, '"rating" must be between 0 and 5')
if (input.reviewCount !== undefined) validate(Number.isInteger(input.reviewCount) && input.reviewCount >= 0, '"reviewCount" must be a non-negative integer')
if (input.photosCount !== undefined) validate(Number.isInteger(input.photosCount) && input.photosCount >= 0, '"photosCount" must be a non-negative integer')
if (input.phoneDigits !== undefined) validate(Number.isInteger(input.phoneDigits) && input.phoneDigits >= 7, '"phoneDigits" must be an integer >= 7')
if (input.brand?.primaryColor !== undefined) validate(/^#[0-9a-fA-F]{6}$/.test(input.brand.primaryColor), '"brand.primaryColor" must be #RRGGBB')

// Layer-3 (P2): obvious placeholder / fake commercial values. The shipped
// example input is a demonstration fixture: it may set "demo": true to
// explicitly mark itself as demo data — the ONLY way placeholder values pass
// (an accidental demo is impossible: the flag must be present AND true).
if (input.demo !== undefined) validate(typeof input.demo === 'boolean', '"demo" must be a boolean (true = explicitly marked demonstration input)')
const demoInput = input.demo === true
if (!demoInput) {
  for (const f of placeholderErrors({ canonical: input.canonical, facebook: input.facebook, instagram: input.instagram, phone: input.phone, whatsapp: input.whatsapp })) {
    fail(`"${f.field}" looks like a test placeholder (${f.value}) — ${f.reason}; supply the real business value`)
  }
} else {
  console.error('[demo] input explicitly marked "demo": true — EXAMPLE VALUES ACCEPTED FOR DEMONSTRATION ONLY.')
  console.error('  REPLACE every value with the real business data before generating a real business.')
}

const OVERRIDE_KEYS = ['currency', 'locale', 'languages', 'phoneDigits']
const hasKey = (obj, key) => obj && typeof obj === 'object' && obj[key] !== undefined

// ---------------------------------------------------------------------------
// 3. Adapter: business input -> dossier documents (BusinessDossier contract).
//    Only documents the input actually provides; the pipeline treats missing
//    documents as empty — no facts are synthesized.
// ---------------------------------------------------------------------------
console.log(`\n=== business:generate: ${slug} ===`)

const businessDoc = {
  id: slug,
  name: input.name,
  category: input.type.toLowerCase(),
  area: input.area,
  ...(hasKey(input, 'booking')
    ? { booking: typeof input.booking === 'boolean' ? input.booking : input.booking }
    : {}),
  ...(input.doctors?.length || input.specialties?.length || input.facilities?.length || input.insurance?.length
    ? {
        attributes: {
          source: 'preserved',
          ...(input.doctors ? { doctors: input.doctors } : {}),
          ...(input.specialties ? { specialties: input.specialties } : {}),
          ...(input.facilities ? { facilities: input.facilities } : {}),
          ...(input.insurance ? { insurance: input.insurance } : {})
        }
      }
    : {})
}

const documents = {
  business: { content: businessDoc },
  brand: {
    content: {
      ...(hasKey(input.brand, 'tagline') ? { tagline: input.brand.tagline } : {}),
      ...(hasKey(input.brand, 'slogan') ? { slogan: input.brand.slogan } : {}),
      ...(input.brand?.keywords ? { keywords: input.brand.keywords } : {}),
      ...(hasKey(input.brand, 'primaryColor') ? { primaryColor: input.brand.primaryColor } : {})
    }
  },
  contact: {
    content: {
      phone: input.phone,
      ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}),
      ...(input.email ? { email: input.email } : {}),
      address: input.address
    }
  },
  location: {
    content: {
      area: input.area,
      ...(input.mapsUrl ? { mapsUrl: input.mapsUrl, coordinates: input.coordinates || undefined } : {})
    }
  },
  hours: { content: { hours: ensureArray(input.hours) } },
  social: {
    content: {
      platforms: [
        { platform: 'facebook', url: input.facebook },
        { platform: 'instagram', url: input.instagram },
        ...(input.tiktok ? [{ platform: 'tiktok', url: input.tiktok }] : []),
        ...(input.youtube ? [{ platform: 'youtube', url: input.youtube }] : []),
        ...(input.linkedin ? [{ platform: 'linkedin', url: input.linkedin }] : []),
        ...(input.twitter ? [{ platform: 'twitter', url: input.twitter }] : [])
      ]
    }
  },
  website: { content: { url: input.canonical, status: 'ok' } },
  reviews: {
    content: {
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.reviewCount !== undefined ? { count: input.reviewCount } : {}),
      reviews: ensureArray(input.reviews)
    }
  },
  photos: { content: { count: input.photosCount || 0 } },
  services: { content: { services: ensureArray(input.services) } },
  products: { content: { products: ensureArray(input.products) } },
  strengths: { content: { strengths: ensureArray(input.strengths) } },
  opportunities: { content: { opportunities: ensureArray(input.opportunities) } }
}

// ---------------------------------------------------------------------------
// 4. Run the existing pipeline derivations (pure, deterministic).
// ---------------------------------------------------------------------------
const norm = normalizeDossier({ documents })
if (norm.errors.length) fail(`dossier normalization errors: ${norm.errors.join('; ')}`)
const n = norm.normalized

let sections = planSections(n)
if (!input.mapsEmbed) {
  sections = {
    plan: sections.plan.map((s) => (s.id === 'location' ? { ...s, enabled: false, disabledReason: 'no maps embed URL in input (adapter rule)' } : s)),
    enabledIds: sections.enabledIds.filter((id) => id !== 'location')
  }
}

const theme = generateThemeTokens(n, { overridePrimary: input.brand?.primaryColor || null })
const manifest = generateAssetsManifest(n)
let configs = buildConfigs(n, {
  themeTokens: theme.tokens,
  defaultMode: theme.defaultMode,
  sections,
  manifest
})

// ---------------------------------------------------------------------------
// 5. Documented adapter patches (evidence: engine reads flat i18n shape;
//    pipeline bakes EGP/11/en/[en,ar] market defaults — input may override).
// ---------------------------------------------------------------------------
if (input.mapsEmbed) configs['contact.json'].mapsEmbed = input.mapsEmbed

if (OVERRIDE_KEYS.some((k) => hasKey(input, k))) {
  const biz = configs['business.json']
  if (hasKey(input, 'currency')) {
    const c = input.currency
    validate(['code', 'symbol', 'position'].every((k) => k in c), '"currency" needs code/symbol/position')
    validate(['before', 'after'].includes(c.position), '"currency.position" must be "before" or "after"')
    biz.currency = {
      code: String(c.code),
      symbol: String(c.symbol),
      position: c.position,
      decimals: Number.isInteger(c.decimals) ? c.decimals : Number(c.decimals ?? 0)
    }
  }
  if (hasKey(input, 'phoneDigits')) biz.phoneDigits = input.phoneDigits
  if (hasKey(input, 'locale')) biz.locale = String(input.locale)
  if (hasKey(input, 'languages')) biz.languages = input.languages
}

configs['i18n.json'] = (() => {
  const labels = configs['i18n.json'].labels || {}
  return {
    locale: configs['i18n.json'].locale || 'en',
    languages: configs['i18n.json'].languages || ['en'],
    nav: { ariaOpen: labels.nav?.ariaOpen || 'Open menu', ariaClose: labels.nav?.ariaClose || 'Close menu' },
    theme: { aria: labels.theme?.aria || 'Toggle dark/light mode' },
    common: { yes: labels.common?.yes || 'Yes', no: labels.common?.no || 'No' }
  }
})()

// ---------------------------------------------------------------------------
// 6. Write temp tree (config + neutral deterministic placeholder assets),
//    then gate the generated configs through the root QA (direct, hermetic).
// ---------------------------------------------------------------------------
const slugDir = join(WORK, slug)
rmSync(WORK, { recursive: true, force: true })
mkdirSync(join(slugDir, 'config'), { recursive: true })
console.log('[generate] writing config files…')
for (const [file, value] of Object.entries(configs)) {
  if (!file.endsWith('.json')) continue
  writeFileSync(join(slugDir, 'config', file), stableJson(value) + '\n')
}
const written = readdirSync(join(slugDir, 'config')).sort()
if (JSON.stringify(written) !== JSON.stringify([...REQUIRED_FILES].sort())) {
  rmSync(WORK, { recursive: true, force: true })
  fail(`generation produced ${written.length} files instead of 19 (${written.join(', ')})`)
}

writeAssets(join(slugDir, 'assets'), n, theme, manifest, input, slug)

console.log('[qa] gating generated configs through the root QA gate (hermetic — no config/ swap)…')
const genConfigDir = join(slugDir, 'config')
const res = spawnSync(process.execPath, ['scripts/qa.mjs', '--config-dir', genConfigDir], { cwd: ROOT, stdio: 'inherit' })
if (res.status !== 0) {
  rmSync(WORK, { recursive: true, force: true })
  fail('root QA gate rejected the generated configs (temp tree removed; active config/ untouched)')
}

// ---------------------------------------------------------------------------
// 7. Atomic move into businesses/<slug> (double-checked overwrite guard).
// ---------------------------------------------------------------------------
if (existsSync(join(BUSINESSES, slug))) {
  rmSync(WORK, { recursive: true, force: true })
  fail(`businesses/${slug} appeared during generation — aborted, nothing written`)
}
renameSync(slugDir, join(BUSINESSES, slug))
rmSync(WORK, { recursive: true, force: true })

console.log(`\n=== business:generate: ${slug} PASS ===`)
console.log(`  businesses/${slug}/config  (19 files, QA-validated)`)
console.log(`  businesses/${slug}/assets  (neutral placeholder assets)`)
console.log('  Next: npm run site -- ' + slug)

// ---------------------------------------------------------------------------
// Neutral placeholder assets — deterministic, business-agnostic graphics
// (design placeholders, NOT business facts; the engine template itself uses
// stock/generic imagery; refs follow the pipeline manifest contract).
// PNG bytes are encoded with node zlib — no dependencies.
// ---------------------------------------------------------------------------
function writeAssets(assetsDir, n, theme, manifest, input, slug) {
  const dark = rgb(theme.tokens.colors.dark)
  const light = rgb(theme.tokens.colors.light)
  const dirs = ['logo', 'hero', 'placeholders', 'gallery']
  for (const d of dirs) mkdirSync(join(assetsDir, d), { recursive: true })

  const logo = pngEncode(128, 128, (x, y) => ringMark(x, y, 128, dark.primary))
  const logoLight = pngEncode(128, 128, (x, y) => ringMark(x, y, 128, light.primary))
  const favicon = pngEncode(32, 32, (x, y) => ringMark(x, y, 32, dark.primary))
  writeFileSync(join(assetsDir, 'logo', 'logo.png'), logo)
  writeFileSync(join(assetsDir, 'logo', 'logo-light.png'), logoLight)
  writeFileSync(join(assetsDir, 'logo', 'favicon.png'), favicon)

  writeFileSync(join(assetsDir, 'hero', 'dark-hero.jpg'), pngEncode(800, 400, (x, y) => heroGrad(x, y, 800, 400, dark)))
  writeFileSync(join(assetsDir, 'hero', 'light-hero.jpg'), pngEncode(800, 400, (x, y) => heroGrad(x, y, 800, 400, light)))

  const foodCount = n.hasMenus ? Math.min(Math.max(n.products.length, 1), 3) : 3
  for (let i = 0; i < 3; i++) {
    const used = i < foodCount
    writeFileSync(join(assetsDir, 'placeholders', `food-${i + 1}.jpg`), pngEncode(300, 200, (x, y) => (used ? plateMark(x, y, 300, 200, theme.tokens.colors.dark, i) : heroGrad(x, y, 300, 200, dark))))
  }
  const galleryCount = manifest.groups.gallery.length
  for (let i = 0; i < galleryCount; i++) {
    writeFileSync(join(assetsDir, 'placeholders', `gallery-${i + 1}.jpg`), pngEncode(300, 200, (x, y) => tileMark(x, y, 300, 200, theme.tokens.colors.dark, i)))
  }
  // P1 fix: SEO/JSON-LD (seo.json.openGraph.image + JSON-LD image) reference
  // /gallery/<hash>.jpg from the manifest — emit those exact files so the
  // referenced asset physically exists (publicDir 'assets' serves them).
  for (let i = 0; i < galleryCount; i++) {
    const ref = manifest.groups.gallery[i].path
    writeFileSync(join(assetsDir, 'gallery', ref.split('/').pop()), pngEncode(800, 400, (x, y) => tileMark(x, y, 800, 400, theme.tokens.colors.dark, i)))
  }
  mkdirSync(join(assetsDir, 'backgrounds'), { recursive: true })
  writeFileSync(join(assetsDir, 'backgrounds', 'map-dark.png'), pngEncode(400, 300, (x, y) => mapMark(x, y, 400, 300, theme.tokens.colors.dark)))
  console.log(`[generate] assets written (${dirs.length} groups + backgrounds — neutral placeholders)`)
}

function rgb(pal) {
  const pick = (k) => String(pal[k]).trim().split(/\s+/).slice(0, 3).map(Number)
  return { base: pick('base'), surface: pick('surface'), primary: pick('primary'), ink: pick('ink'), 'base-deep': pick('base-deep') }
}

function lerp(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t))
}

function ringMark(x, y, size, primary) {
  const cx = size / 2 - 0.5
  const d = Math.hypot(x - cx, y - cx) / size
  if (d > 0.27 && d < 0.36) return [...primary, 255]
  if (d < 0.06) return [255, 255, 255, 255]
  return [0, 0, 0, 0]
}

function heroGrad(x, y, w, h, pal) {
  const t = y / h
  const c = lerp(pal.base, pal['base-deep'], t)
  const diag = Math.abs((x / w - y / h) * 2)
  if (diag < 0.06) return lerp(c, pal.primary, 0.35)
  return [...c, 255]
}

function plateMark(x, y, w, h, pal, variant) {
  const cx = w / 2
  const cy = h / 2
  const r = Math.hypot(x - cx, y - cy)
  const acc = r < h * 0.34 ? lerp(pal.surface, pal['base-deep'], r / (h * 0.34) * 0.5) : pal['base-deep']
  if (r < h * 0.14) return lerp(acc, pal.primary, 0.4)
  if (h * 0.34 - r < 2.5) return pal.primary
  return [...acc, 255]
}

function tileMark(x, y, w, h, pal, seed) {
  const cell = 50
  const cx = Math.floor(x / cell)
  const cy = Math.floor(y / cell)
  const odd = (cx + cy + seed) % 2
  const base = odd ? pal.surface : pal['base-deep']
  const inner = (x % cell) > 12 && (x % cell) < cell - 12 && (y % cell) > 12 && (y % cell) < cell - 12
  return inner ? lerp(base, pal.primary, odd ? 0.12 : 0.08) : base
}

function mapMark(x, y, w, h, pal) {
  const grid = x % 40 === 0 || y % 40 === 0
  let c = lerp(pal.base, pal['base-deep'], 0.2)
  if (grid) c = lerp(c, pal.primary, 0.15)
  const d = Math.hypot(x - w / 2, y - h / 2)
  if (d < 14) c = pal.primary
  if (d < 20 && d >= 14) c = [255, 255, 255, 255]
  return [...c, 255]
}

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function pngEncode(w, h, pixel) {
  const stride = 1 + w * 4
  const raw = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const row = y * stride
    raw[row] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = row + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a === undefined ? 255 : a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}