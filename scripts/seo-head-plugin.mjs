// scripts/seo-head-plugin.mjs
// ---------------------------------------------------------------------------
// E2E-03: build-time SEO head injection (initial-HTML / SSR SEO fidelity).
//
// The raw index.html shipped by the build was a static shell (title
// "Business Website", no description/canonical/OG/JSON-LD) — all business
// metadata was only materialized at runtime by src/core/seo.js after
// hydration, so crawlers / social scrapers / no-JS consumers saw generic
// metadata.
//
// This module mirrors the PROVEN website-engine pattern
// (AgencyOS/website-engine/builders/head.js + export/html.js):
//   config -> head metadata -> serialized HTML
// at the Vite layer, using the project's own runtime semantics as the
// metadata derivation (see src/core/seo.js) so the initial HTML carries
// EXACTLY the values applySEO() sets after hydration. It is fully
// business-agnostic: it reads whatever business config is active in
// config/ (swap performed by scripts/build-business.mjs before the build).
//
// The runtime SEO manager (src/core/seo.js) is intentionally untouched:
// after hydration it upserts the same values onto the same tags, so
// initial-HTML metadata and hydrated metadata agree.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Mirrors src/core/seo.js SCHEMA_TYPES (single source: the runtime mapping).
export const SCHEMA_TYPES = {
  restaurant: 'Restaurant',
  cafe: 'CafeOrCoffeeShop',
  bakery: 'Bakery',
  pizza: 'FastFoodRestaurant',
  burger: 'FastFoodRestaurant',
  dessert: 'IceCreamShop',
  hotel: 'Hotel',
  clinic: 'MedicalClinic',
  gym: 'HealthClub',
  barber: 'HairSalon',
  'beauty-salon': 'BeautySalon',
  beauty: 'BeautySalon',
  default: 'LocalBusiness',
}

export function schemaType(type) {
  return SCHEMA_TYPES[String(type || '').toLowerCase()] || SCHEMA_TYPES.default
}

// Mirrors src/core/assets.js asset(): absolute/remote/data/blob values pass
// through; bare references resolve against /assets/.
function resolveAsset(key, fallback = '') {
  if (!key) return fallback
  const str = String(key)
  if (/^(https?:)?\/\//.test(str) || str.startsWith('data:') || str.startsWith('blob:')) return str
  if (str.startsWith('/')) return str
  return `/assets/${str}`
}

// Mirrors src/core/seo.js buildLocalBusinessJsonLd() field-for-field so the
// serialized JSON-LD matches what applySEO() writes after hydration.
// JSON.parse(JSON.stringify()) strips undefined keys — same as runtime.
function buildLocalBusinessJsonLd({ business, brand, contact, social, seo }) {
  const socialLinks = Object.values(social || {}).filter((url) => url)
  const hours = (contact?.hours || []).map((h) => `${h.days} ${h.time}`)
  const type = SCHEMA_TYPES[String(business?.type || '').toLowerCase()] || SCHEMA_TYPES.default

  const base = {
    '@context': 'https://schema.org',
    '@type': type,
    name: business?.name || brand?.name || '',
    description: seo?.description || brand?.description || '',
    url: seo?.canonical || undefined,
    image: resolveAsset(seo?.openGraph?.image || brand?.logo?.dark) || undefined,
    telephone: contact?.phoneRaw || contact?.phone || undefined,
    email: contact?.email || undefined,
    address: contact?.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: contact.addressShort || contact.address,
          addressLocality: contact.area || '',
        }
      : undefined,
    openingHours: hours.length ? hours : undefined,
    priceRange: '$$',
    sameAs: socialLinks.length ? socialLinks : undefined,
  }

  return JSON.parse(JSON.stringify(base))
}

// Mirrors src/core/seo.js applySEO() value semantics. Returns a plain
// metadata object: { title, meta, property, canonical, jsonLd }.
export function buildHeadMetadata({ seo = {}, business = {}, brand = {}, contact = {}, social = {} }) {
  const title = seo.title || brand.name || 'Business Website'
  const description = seo.description || brand.description || ''

  const meta = {
    description,
    keywords: Array.isArray(seo.keywords) ? seo.keywords.join(', ') : seo.keywords || '',
    author: seo.author || brand.name || '',
    robots: seo.robots || 'index, follow',
    // Runtime emits twitter tags with name= (upsertMeta('name', 'twitter:*')).
    'twitter:card': seo.twitter?.card || 'summary_large_image',
    'twitter:title': seo.twitter?.title || seo.title || brand.name || '',
    'twitter:description': seo.twitter?.description || seo.description || '',
    'twitter:image': resolveAsset(seo.twitter?.image) || '',
  }
  const property = {
    'og:type': seo.openGraph?.type || 'website',
    'og:site_name': seo.openGraph?.siteName || brand.name || '',
    'og:title': seo.openGraph?.title || seo.title || brand.name || '',
    'og:description': seo.openGraph?.description || seo.description || '',
    'og:image': resolveAsset(seo.openGraph?.image) || '',
    'og:locale': seo.openGraph?.locale || 'en_US',
    'og:url': seo.canonical || '',
  }

  const jsonLd = buildLocalBusinessJsonLd({ business, brand, contact, social, seo })
  if (seo.schemaType && SCHEMA_TYPES[String(seo.schemaType).toLowerCase()]) {
    jsonLd['@type'] = SCHEMA_TYPES[String(seo.schemaType).toLowerCase()]
  }

  return { title, meta, property, canonical: seo.canonical || null, jsonLd }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Renders the metadata block exactly as the runtime would upsert it:
// <meta name="..."> basics, <meta property="og:*">, twitter, canonical,
// then the JSON-LD script tagged with data-site-jsonld (the selector
// applySEO() uses to find/replace structured data after hydration).
function renderHeadBlock(metadata) {
  const lines = []
  for (const [name, content] of Object.entries(metadata.meta || {})) {
    if (content) lines.push(`  <meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">`)
  }
  for (const [prop, content] of Object.entries(metadata.property || {})) {
    if (content) lines.push(`  <meta property="${escapeHtml(prop)}" content="${escapeHtml(content)}">`)
  }
  if (metadata.canonical) lines.push(`  <link rel="canonical" href="${escapeHtml(metadata.canonical)}">`)
  lines.push(`  <script type="application/ld+json" data-site-jsonld>${JSON.stringify(metadata.jsonLd)}</script>`)
  return lines.join('\n')
}

// Injects business-specific head metadata into a raw HTML document:
// replaces <title>, removes any pre-existing runtime-managed SEO tags
// (defensive), and inserts the full block right after <head>.
export function injectHeadMetadata(html, metadata) {
  let out = String(html)

  out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(metadata.title)}</title>`)
  out = out.replace(/<meta[^>]+name="(?:description|keywords|author|robots|twitter:[^"]*)"[^>]*>\s*/gi, '')
  out = out.replace(/<meta[^>]+property="og:[^"]*"[^>]*>\s*/gi, '')
  out = out.replace(/<link[^>]+rel="canonical"[^>]*>\s*/gi, '')
  out = out.replace(/<script[^>]+data-site-jsonld[^>]*>[\s\S]*?<\/script>\s*/gi, '')

  const block = renderHeadBlock(metadata)
  // Function replacement: a string replacement would interpret "$$" (e.g.
  // JSON-LD priceRange "$$") as a literal dollar sign.
  return out.replace(/(<head[^>]*>)/i, (m) => `${m}\n${block}`)
}

// Vite plugin: injects the ACTIVE business's SEO metadata into index.html
// during transformIndexHtml (used by both build and dev server).
// Generic by construction — reads whatever config/ holds, so it works for
// every business the pipeline builds, present and future.
//
// NOTE: the config file is bundled to CJS by Vite before loading, so
// import.meta.url is unavailable here; instead the config root comes from
// Vite's own configResolved hook (config.root).
export function seoHeadPlugin({ configDir = null } = {}) {
  let configRoot = configDir || join(process.cwd(), 'config')
  return {
    name: 'seo-head',
    configResolved(config) {
      if (!configDir) configRoot = join(config.root, 'config')
    },
    transformIndexHtml(html) {
      try {
        const read = (file) => JSON.parse(readFileSync(join(configRoot, file), 'utf8'))
        const metadata = buildHeadMetadata({
          seo: read('seo.json'),
          business: read('business.json'),
          brand: read('brand.json'),
          contact: read('contact.json'),
          social: read('social.json'),
        })
        return injectHeadMetadata(html, metadata)
      } catch {
        // No business config present (fresh checkout / partial repo):
        // keep the static shell untouched.
        return html
      }
    },
  }
}
