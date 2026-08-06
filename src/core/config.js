// src/core/config.js
// ---------------------------------------------------------------------------
// Config access helpers. Provides safe, defaulted access to the active
// business configuration plus a few derived values (currency, locale, etc.)
// ---------------------------------------------------------------------------

import { SITE } from './site'

/**
 * Resolve a possibly-nested path on the site config.
 * Example: cfg('contact.phone')
 */
export function cfg(path, fallback = undefined) {
  const parts = String(path).split('.')
  let node = SITE
  for (const part of parts) {
    if (node == null) return fallback
    node = node[part]
  }
  return node === undefined ? fallback : node
}

/** True when the given section id is enabled in business.sections */
export function sectionEnabled(id) {
  return Array.isArray(SITE.business?.sections) && SITE.business.sections.includes(id)
}

/** Ordered, enabled section ids */
export function enabledSections() {
  return SITE.business?.sections || []
}

/** Currency formatting for prices */
export function formatPrice(value) {
  const currency = SITE.business?.currency || { code: '', symbol: '', position: 'after', decimals: 0 }
  const digits = currency.decimals ?? 0
  const symbol = currency.symbol || currency.code || ''
  const number = Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return currency.position === 'before' ? `${symbol} ${number}` : `${number} ${symbol}`
}

/** Current active locale (from config, overrideable at runtime) */
export function getLocale() {
  return SITE.business?.locale || 'en'
}

/** Business type (restaurant, cafe, hotel, clinic, gym, ...) */
export function businessType() {
  return SITE.business?.type || 'business'
}
