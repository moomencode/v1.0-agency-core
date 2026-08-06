// src/core/theme.js
// ---------------------------------------------------------------------------
// Theme engine: translates config/theme.json into CSS custom properties and
// font loading at runtime, so a new business can restyle the entire site by
// editing JSON alone — no Tailwind build changes required.
//
// Color tokens map 1:1 to Tailwind classes (see tailwind.config.js):
//   bg-base, bg-base-deep, bg-surface, text-ink, text-primary, ...
// Each token is an "R G B" triplet in theme.json.
// ---------------------------------------------------------------------------

import { SITE } from './site'

export const THEME_STORAGE_KEY = 'site-theme'

const darkPalette = SITE.theme?.colors?.dark || {}
const lightPalette = SITE.theme?.colors?.light || darkPalette

/** Inject CSS custom properties + font <link> from theme.json */
export function applyTheme() {
  const root = document.documentElement
  const styleId = 'site-theme-vars'

  let style = document.getElementById(styleId)
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }

  const toVars = (palette) =>
    Object.entries(palette)
      .map(([key, value]) => `  --c-${key}: ${value};`)
      .join('\n')

  style.textContent = `:root {\n${toVars(darkPalette)}\n}\n.light {\n${toVars(lightPalette)}\n}`

  const typography = SITE.theme?.typography || {}
  if (typography.display) root.style.setProperty('--font-display', typography.display)
  if (typography.body) root.style.setProperty('--font-body', typography.body)

  // Load Google Fonts dynamically (config-driven)
  if (typography.fontsUrl && !document.querySelector('link[data-site-fonts]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = typography.fontsUrl
    link.dataset.siteFonts = ''
    document.head.appendChild(link)
  }
}

export function defaultTheme() {
  return SITE.theme?.defaultMode || 'dark'
}

export function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || defaultTheme()
  } catch (_) {
    return defaultTheme()
  }
}

export function writeStoredTheme(mode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch (_) {
    /* ignore */
  }
}
