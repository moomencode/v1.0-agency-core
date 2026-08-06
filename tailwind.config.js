/** @type {import('tailwindcss').Config} */
/**
 * Tailwind config generated from config/theme.json:
 *  - color tokens  -> one Tailwind color per theme key (bg-base, text-ink, ...)
 *  - typography    -> font-display / font-body
 *  - shadows       -> shadow-primary, shadow-elevated, ...
 *  - transitions   -> ease-premium, ease-spring
 *
 * The runtime values live in CSS custom properties injected by
 * src/core/theme.js — restyle the whole site by editing theme.json.
 */
const theme = require('./config/theme.json')

const colors = {}
const allPalettes = { ...(theme.colors?.dark || {}), ...(theme.colors?.light || {}) }
Object.keys(allPalettes).forEach((key) => {
  colors[key] = `rgb(var(--c-${key}) / <alpha-value>)`
})

const shadows = {}
Object.entries(theme.shadows || {}).forEach(([key, value]) => {
  shadows[key] = value
})

const fonts = {}
const typography = theme.typography || {}
if (typography.display) fonts.display = typography.display
if (typography.body) fonts.body = typography.body

module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors,
      fontFamily: fonts,
      boxShadow: shadows,
      backgroundImage: {
        'base-gradient':
          'linear-gradient(180deg, rgb(var(--c-base)) 0%, rgb(var(--c-base-deep)) 100%)',
      },
      transitionTimingFunction: {
        premium: theme.animations?.ease || 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        spring: theme.animations?.spring || 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
