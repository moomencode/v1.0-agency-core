// src/core/i18n.js
// ---------------------------------------------------------------------------
// Lightweight localization layer.
//
// Every text field inside config JSON may be EITHER:
//   - a plain string:          "Welcome"
//   - a locale map:            { "en": "Welcome", "ar": "\u0623\u0647\u0644\u0627" }
//
// `t(value)` returns the string for the active locale (business.locale or
// the `site-locale` localStorage override). Unknown locales fall back to the
// first key, then to a plain string. This gives unlimited languages with
// zero framework weight.
// ---------------------------------------------------------------------------

import { getLocale } from './config'

const STORAGE_KEY = 'site-locale'

export function setLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch (_) {
    /* ignore storage errors */
  }
}

export function currentLocale() {
  if (typeof window !== 'undefined') {
    try {
      const override = localStorage.getItem(STORAGE_KEY)
      if (override) return override
    } catch (_) {
      /* ignore storage errors */
    }
  }
  return getLocale()
}

export function t(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const locale = currentLocale()
    if (typeof value[locale] === 'string') return value[locale]
    const keys = Object.keys(value)
    return typeof value[keys[0]] === 'string' ? value[keys[0]] : ''
  }
  return String(value)
}

/** True when a value is a multi-locale map */
export function isLocalized(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
