// src/core/seo.js
// ---------------------------------------------------------------------------
// SEO manager: applies everything from config/seo.json + business/brand/
// contact/social at runtime:
//   - <title>, meta description/keywords/author/robots
//   - canonical URL
//   - Open Graph + Twitter card tags
//   - favicon
//   - JSON-LD structured data (Schema.org) chosen by business type
//   - <html lang> from business.locale
//
// The type -> Schema.org mapping covers the supported business types and
// falls back to LocalBusiness for anything new.
// ---------------------------------------------------------------------------

import { SITE } from './site'
import { asset } from './assets'

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
  'beauty': 'BeautySalon',
  default: 'LocalBusiness',
}

export function schemaType(type) {
  return SCHEMA_TYPES[String(type || '').toLowerCase()] || SCHEMA_TYPES.default
}

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content || '')
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  if (href) el.setAttribute('href', href)
}

function buildLocalBusinessJsonLd(type) {
  const { business, brand, contact, social, seo } = SITE
  const socialLinks = Object.values(social || {}).filter((url) => url)
  const hours = (contact?.hours || []).map((h) => `${h.days} ${h.time}`)
  const schemaType = SCHEMA_TYPES[String(business?.type || '').toLowerCase()] || SCHEMA_TYPES.default

  const base = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: business?.name || brand?.name || '',
    description: seo?.description || brand?.description || '',
    url: seo?.canonical || undefined,
    image: asset(seo?.openGraph?.image || brand?.logo?.dark) || undefined,
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

export function applySEO() {
  const { business, brand, seo, contact } = SITE

  if (document.documentElement) {
    document.documentElement.lang = business?.locale || 'en'
  }

  // Basics
  document.title = seo?.title || brand?.name || 'Business Website'
  upsertMeta('name', 'description', seo?.description || brand?.description || '')
  upsertMeta('name', 'keywords', Array.isArray(seo?.keywords) ? seo.keywords.join(', ') : seo?.keywords || '')
  upsertMeta('name', 'author', seo?.author || brand?.name || '')
  upsertMeta('name', 'robots', seo?.robots || 'index, follow')
  upsertMeta('property', 'og:type', seo?.openGraph?.type || 'website')
  upsertMeta('property', 'og:site_name', seo?.openGraph?.siteName || brand?.name || '')
  upsertMeta('property', 'og:title', seo?.openGraph?.title || seo?.title || brand?.name || '')
  upsertMeta('property', 'og:description', seo?.openGraph?.description || seo?.description || '')
  upsertMeta('property', 'og:image', asset(seo?.openGraph?.image) || '')
  upsertMeta('property', 'og:locale', seo?.openGraph?.locale || 'en_US')
  upsertMeta('property', 'og:url', seo?.canonical || '')

  // Twitter
  upsertMeta('name', 'twitter:card', seo?.twitter?.card || 'summary_large_image')
  upsertMeta('name', 'twitter:title', seo?.twitter?.title || seo?.title || brand?.name || '')
  upsertMeta('name', 'twitter:description', seo?.twitter?.description || seo?.description || '')
  upsertMeta('name', 'twitter:image', asset(seo?.twitter?.image) || '')

  // Canonical + favicon
  upsertLink('canonical', seo?.canonical || undefined)
  upsertLink('icon', asset(brand?.logo?.favicon || brand?.logo?.dark))

  // Structured data (replace previous if business changes)
  const schema = buildLocalBusinessJsonLd(business?.type)
  if (seo?.schemaType && SCHEMA_TYPES[String(seo.schemaType).toLowerCase()]) {
    schema['@type'] = SCHEMA_TYPES[String(seo.schemaType).toLowerCase()]
  }
  let script = document.head.querySelector('script[data-site-jsonld]')
  if (!script) {
    script = document.createElement('script')
    script.setAttribute('data-site-jsonld', '')
    script.type = 'application/ld+json'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(schema)

  // Keep the page addressable for crawlers
  return {
    title: document.title,
    canonical: seo?.canonical || '',
    schema,
  }
}

/** Compose a sitemap.xml entry list (used by the build script too) */
export function sitemapEntries(baseUrl) {
  const { navigation } = SITE
  const anchors = new Set()
  const entries = []
  if (baseUrl) entries.push({ url: baseUrl, priority: '1.0' })
  ;(navigation?.items || []).forEach((item) => {
    if (item.href && item.href.startsWith('#')) {
      const anchor = item.href.slice(1)
      if (!anchors.has(anchor)) {
        anchors.add(anchor)
        entries.push({ url: `${baseUrl}${item.href}`, priority: '0.8' })
      }
    }
  })
  return entries
}
