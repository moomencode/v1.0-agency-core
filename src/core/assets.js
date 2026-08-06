// src/core/assets.js
// ---------------------------------------------------------------------------
// Media system: resolves any asset reference from configuration into a
// usable URL.
//
// Accepted asset values:
//   - "https://...", "http://..."          -> remote image, used as-is
//   - "data:..."                           -> inline data URI, used as-is
//   - "/logo/logo.png"                     -> project asset served from /assets
//   - "logo/logo.png" (no leading slash)   -> resolved against the assets dir
//   - "folder/name" without extension      -> resolved against assets dir
//   - "" / null / undefined                -> returns the provided fallback
//
// Local assets live under /assets/<kind>/... (logo/, hero/, gallery/, food/,
// background/, icons/, videos/) and are copied into the build output as-is.
// ---------------------------------------------------------------------------

const ASSETS_BASE = '/'

export function asset(key, fallback = '') {
  if (!key) return fallback
  const str = String(key)
  if (/^(https?:)?\/\//.test(str) || str.startsWith('data:') || str.startsWith('blob:')) return str
  if (str.startsWith('/')) return str
  return `${ASSETS_BASE}assets/${str}`
}

/** Convenience for theme-dependent images: { dark: "...", light: "..." } */
export function themedImage(map, theme = 'dark') {
  if (!map) return ''
  if (typeof map === 'string') return asset(map)
  return asset(map[theme] || map.dark || map.light || '')
}
