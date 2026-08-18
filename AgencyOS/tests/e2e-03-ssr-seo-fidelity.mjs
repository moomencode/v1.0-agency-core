// AgencyOS/tests/e2e-03-ssr-seo-fidelity.mjs
// ---------------------------------------------------------------------------
// E2E-03 regression: initial-HTML / SSR SEO fidelity.
//
// Guards the production fix for the runtime-only SEO defect: the raw
// index.html used to ship a generic shell (title "Business Website", no
// description / canonical / Open Graph / JSON-LD) until client JS executed.
//
// This suite inspects RAW/INITIAL HTML — never the post-hydration DOM:
//   1. Metadata derivation (scripts/seo-head-plugin.mjs buildHeadMetadata)
//      must equal the config-driven expectations (seo.json / business.json /
//      brand.json / contact.json / social.json) that src/core/seo.js applies
//      at runtime — i.e. initial-HTML metadata and hydrated metadata agree.
//   2. Injecting that metadata into the real repo index.html must produce a
//      business-specific <head> (title, description, canonical, OG, Twitter,
//      JSON-LD) with zero generic "Business Website" leftovers.
//   3. The REAL vite transform (seoHeadPlugin().transformIndexHtml) must
//      produce the same result from a sandboxed business config.
//   4. Cross-business SEO isolation in both directions.
// ---------------------------------------------------------------------------

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildHeadMetadata,
  injectHeadMetadata,
  SCHEMA_TYPES,
  seoHeadPlugin,
} from '../../scripts/seo-head-plugin.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BUSINESSES = path.join(REPO, 'businesses')
const INDEX_HTML = path.join(REPO, 'index.html')

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

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  if (typeof a === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]))
  }
  return false
}

const decode = (s) =>
  String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

const titleOf = (html) => {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decode(m[1]) : ''
}
const metaOf = (html, attr, key) => {
  const m = html.match(new RegExp(`<meta[^>]+${attr}="${key}"[^>]*content="([^"]*)"`, 'i'))
  return m ? decode(m[1]) : ''
}
const canonicalOf = (html) => {
  const m = html.match(/<link[^>]+rel="canonical"[^>]*href="([^"]*)"/i)
  return m ? decode(m[1]) : ''
}
const jsonLdOf = (html) => {
  const m = html.match(/<script[^>]+data-site-jsonld[^>]*>([\s\S]*?)<\/script>/i)
  return m ? JSON.parse(m[1]) : null
}

function loadBusiness(name) {
  const dir = path.join(BUSINESSES, name, 'config')
  const read = (file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'))
  return {
    seo: read('seo.json'),
    business: read('business.json'),
    brand: read('brand.json'),
    contact: read('contact.json'),
    social: read('social.json'),
  }
}

function expectedMetadata(cfg) {
  const { seo, business, brand, contact, social } = cfg
  const og = seo.openGraph || {}
  const tw = seo.twitter || {}
  const socialLinks = Object.values(social || {}).filter((url) => url)
  const hours = (contact.hours || []).map((h) => `${h.days} ${h.time}`)
  // Mirrors src/core/seo.js: type derives from business.type; seo.schemaType
  // only overrides when its lowercase form is a valid SCHEMA_TYPES key.
  const baseType = SCHEMA_TYPES[String(business.type || '').toLowerCase()] || SCHEMA_TYPES.default
  const type = seo.schemaType && SCHEMA_TYPES[String(seo.schemaType).toLowerCase()]
    ? SCHEMA_TYPES[String(seo.schemaType).toLowerCase()]
    : baseType
  const schema = JSON.parse(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': type,
      name: business.name || brand.name || '',
      description: seo.description || brand.description || '',
      url: seo.canonical || undefined,
      image: seo.openGraph?.image || brand.logo?.dark || undefined,
      telephone: contact.phoneRaw || contact.phone || undefined,
      email: contact.email || undefined,
      address: contact.address
        ? {
            '@type': 'PostalAddress',
            streetAddress: contact.addressShort || contact.address,
            addressLocality: contact.area || '',
          }
        : undefined,
      openingHours: hours.length ? hours : undefined,
      priceRange: '$$',
      sameAs: socialLinks.length ? socialLinks : undefined,
    }),
  )
  return {
    title: seo.title || brand.name || 'Business Website',
    description: seo.description || brand.description || '',
    keywords: Array.isArray(seo.keywords) ? seo.keywords.join(', ') : seo.keywords || '',
    author: seo.author || brand.name || '',
    robots: seo.robots || 'index, follow',
    canonical: seo.canonical || '',
    ogType: og.type || 'website',
    ogSiteName: og.siteName || brand.name || '',
    ogTitle: og.title || seo.title || brand.name || '',
    ogDescription: og.description || seo.description || '',
    ogImage: og.image || '',
    ogLocale: og.locale || 'en_US',
    ogUrl: seo.canonical || '',
    twCard: tw.card || 'summary_large_image',
    twTitle: tw.title || seo.title || brand.name || '',
    twDescription: tw.description || seo.description || '',
    twImage: tw.image || '',
    schema,
  }
}

const rawIndexHtml = readFileSync(INDEX_HTML, 'utf8')

const sandboxes = []
const BUSINESSES_LIST = ['garcia', 'cafe-luna']

try {
  for (const name of BUSINESSES_LIST) {
    console.log(`== e2e-03 initial HTML SEO fidelity: ${name} ==`)
    const cfg = loadBusiness(name)
    const exp = expectedMetadata(cfg)

    const metadata = buildHeadMetadata(cfg)

    // ---- 1. Metadata derivation vs config-driven expectations ----
    check(metadata.title === exp.title, `${name}: derived title = "${exp.title}"`)
    check(metadata.meta.description === exp.description, `${name}: derived description matches config`)
    check(metadata.meta.keywords === exp.keywords, `${name}: derived keywords = "${exp.keywords}"`)
    check(metadata.meta.author === exp.author, `${name}: derived author = "${exp.author}"`)
    check(metadata.meta.robots === exp.robots, `${name}: derived robots = "${exp.robots}"`)
    check(metadata.canonical === exp.canonical, `${name}: derived canonical = "${exp.canonical}"`)
    check(metadata.property['og:type'] === exp.ogType, `${name}: og:type = "${exp.ogType}"`)
    check(metadata.property['og:site_name'] === exp.ogSiteName, `${name}: og:site_name = "${exp.ogSiteName}"`)
    check(metadata.property['og:title'] === exp.ogTitle, `${name}: og:title = "${exp.ogTitle}"`)
    check(metadata.property['og:description'] === exp.ogDescription, `${name}: og:description = "${exp.ogDescription}"`)
    check(metadata.property['og:image'] === exp.ogImage, `${name}: og:image = "${exp.ogImage}"`)
    check(metadata.property['og:locale'] === exp.ogLocale, `${name}: og:locale = "${exp.ogLocale}"`)
    check(metadata.property['og:url'] === exp.ogUrl, `${name}: og:url = "${exp.ogUrl}"`)
    check(metadata.meta['twitter:card'] === exp.twCard, `${name}: twitter:card = "${exp.twCard}"`)
    check(metadata.meta['twitter:title'] === exp.twTitle, `${name}: twitter:title = "${exp.twTitle}"`)
    check(metadata.meta['twitter:description'] === exp.twDescription, `${name}: twitter:description = "${exp.twDescription}"`)
    check(metadata.meta['twitter:image'] === exp.twImage, `${name}: twitter:image = "${exp.twImage}"`)

    // ---- JSON-LD derivation ----
    check(deepEqual(metadata.jsonLd, exp.schema), `${name}: JSON-LD deep-equals config-derived structured data`)
    check(metadata.jsonLd['@type'] === exp.schema['@type'], `${name}: JSON-LD @type = "${metadata.jsonLd['@type']}"`)
    check(!JSON.stringify(metadata.jsonLd).includes('undefined'), `${name}: JSON-LD serializes without undefined keys`)
    check(
      metadata.jsonLd['@context'] === 'https://schema.org' && typeof metadata.jsonLd.url === 'string' && metadata.jsonLd.name.length > 0,
      `${name}: JSON-LD carries identity/type/canonical info`
    )

    // ---- 2. Raw initial HTML (real repo index.html + real injector) ----
    const html = injectHeadMetadata(rawIndexHtml, metadata)
    const titles = html.match(/<title[^>]*>[\s\S]*?<\/title>/gi) || []
    check(titles.length === 1, `${name}: exactly one <title> tag`)
    check(titleOf(html) === exp.title, `${name}: initial <title> = "${exp.title}"`)
    check(metaOf(html, 'name', 'description') === exp.description, `${name}: initial meta description = "${exp.description}"`)
    check(metaOf(html, 'name', 'keywords') === exp.keywords, `${name}: initial meta keywords = "${exp.keywords}"`)
    check(metaOf(html, 'name', 'author') === exp.author, `${name}: initial meta author = "${exp.author}"`)
    check(metaOf(html, 'name', 'robots') === exp.robots, `${name}: initial meta robots = "${exp.robots}"`)
    check(canonicalOf(html) === exp.canonical, `${name}: initial canonical = "${exp.canonical}"`)
    check(metaOf(html, 'property', 'og:title') === exp.ogTitle, `${name}: initial og:title = "${exp.ogTitle}"`)
    check(metaOf(html, 'property', 'og:description') === exp.ogDescription, `${name}: initial og:description = "${exp.ogDescription}"`)
    check(metaOf(html, 'property', 'og:url') === exp.ogUrl, `${name}: initial og:url = "${exp.ogUrl}"`)
    check(metaOf(html, 'property', 'og:locale') === exp.ogLocale, `${name}: initial og:locale = "${exp.ogLocale}"`)
    check(metaOf(html, 'property', 'og:image') === exp.ogImage, `${name}: initial og:image = "${exp.ogImage}"`)
    check(metaOf(html, 'name', 'twitter:card') === exp.twCard, `${name}: initial twitter:card = "${exp.twCard}"`)
    check(metaOf(html, 'name', 'twitter:title') === exp.twTitle, `${name}: initial twitter:title = "${exp.twTitle}"`)
    check(metaOf(html, 'name', 'twitter:description') === exp.twDescription, `${name}: initial twitter:description = "${exp.twDescription}"`)
    check(metaOf(html, 'name', 'twitter:image') === exp.twImage, `${name}: initial twitter:image = "${exp.twImage}"`)
    const ld = jsonLdOf(html)
    check(ld !== null, `${name}: initial HTML contains JSON-LD script`)
    if (ld) check(deepEqual(ld, metadata.jsonLd), `${name}: initial JSON-LD content deep-equals derived structured data`)
    check(!html.includes('Business Website'), `${name}: no generic "Business Website" left in HTML`)
    check(html.includes("localStorage.getItem('site-theme')"), `${name}: pre-hydration theme script preserved`)
    check(/<html lang="en" dir="ltr" class="dark">/.test(html), `${name}: <html> lang/dir/class attributes preserved`)
    check(html.includes('rel="icon" type="image/png" href="/logo/logo.png"'), `${name}: static favicon link preserved`)
    check(html.includes('<meta charset="UTF-8"'), `${name}: charset preserved`)
    check(html.includes('width=device-width, initial-scale=1.0'), `${name}: viewport preserved`)

    // ---- 3. REAL vite transform (sandboxed business config) ----
    const sb = mkdtempSync(path.join(tmpdir(), 'e2e-03-'))
    sandboxes.push(sb)
    const sbConfig = path.join(sb, 'config')
    mkdirSync(sbConfig)
    for (const file of ['seo.json', 'business.json', 'brand.json', 'contact.json', 'social.json']) {
      cpSync(path.join(BUSINESSES, name, 'config', file), path.join(sbConfig, file))
    }
    const plugin = seoHeadPlugin({ configDir: sbConfig })
    check(plugin.name === 'seo-head', `${name}: plugin registers as "seo-head"`)
    const transformed = plugin.transformIndexHtml(rawIndexHtml)
    check(typeof transformed === 'string' && transformed !== rawIndexHtml, `${name}: vite transform modifies index.html`)
    check(titleOf(transformed) === exp.title, `${name}: vite transform emits business title`)
    check(metaOf(transformed, 'name', 'description') === exp.description, `${name}: vite transform emits business description`)
    check(canonicalOf(transformed) === exp.canonical, `${name}: vite transform emits business canonical`)
    const tld = jsonLdOf(transformed)
    check(tld !== null && tld['@type'] === metadata.jsonLd['@type'] && tld.url === exp.canonical, `${name}: vite transform emits JSON-LD with type + canonical`)
    check(!transformed.includes('Business Website'), `${name}: vite transform leaves no generic title`)

    // ---- 4. Cross-business SEO isolation ----
    const other = BUSINESSES_LIST.find((b) => b !== name)
    const otherCfg = loadBusiness(other)
    if (name === 'cafe-luna') {
      check(!/garcia/i.test(transformed), 'cafe-luna: ZERO Garcia-specific SEO tokens in initial HTML')
      check(!transformed.includes(otherCfg.seo.canonical), 'cafe-luna: zero garcia canonical')
      check(!transformed.includes('Garcia Executive Combo'), 'cafe-luna: zero "Garcia Executive Combo"')
      check(!transformed.includes('Heliopolis'), 'cafe-luna: zero garcia location tokens')
    } else {
      check(!/cafe[-\s]?luna/i.test(transformed), 'garcia: ZERO Cafe-Luna-specific SEO tokens in initial HTML')
      check(!transformed.includes(otherCfg.seo.canonical), 'garcia: zero cafe-luna canonical')
      check(!transformed.includes('Zamalek'), 'garcia: zero cafe-luna location tokens')
    }
  }

  // ---- 5. Wiring + genericity guards ----
  console.log('== e2e-03 wiring + genericity ==')
  const viteConfig = readFileSync(path.join(REPO, 'vite.config.js'), 'utf8')
  check(viteConfig.includes('seoHeadPlugin'), 'vite.config.js imports seoHeadPlugin')
  check(/plugins:\s*\[[^\]]*seoHeadPlugin\(\)/.test(viteConfig), 'vite.config.js registers seoHeadPlugin() in plugins array')
  const pluginSource = readFileSync(path.join(REPO, 'scripts', 'seo-head-plugin.mjs'), 'utf8')
  check(!/garcia|Garcia/.test(pluginSource), 'seo-head-plugin.mjs contains no hardcoded garcia references')
  check(!/cafe[-\s]?luna/i.test(pluginSource), 'seo-head-plugin.mjs contains no hardcoded cafe-luna references')
  const emptySb = mkdtempSync(path.join(tmpdir(), 'e2e-03-'))
  sandboxes.push(emptySb)
  check(
    seoHeadPlugin({ configDir: emptySb }).transformIndexHtml(rawIndexHtml) === rawIndexHtml,
    'seo-head plugin falls back to untouched shell when config is absent'
  )
} finally {
  for (const sb of sandboxes) {
    try {
      rmSync(sb, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
}

console.log(`\ne2e-03-ssr-seo-fidelity: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
