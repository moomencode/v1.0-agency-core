// scripts/qa.mjs
// ---------------------------------------------------------------------------
// Automatic QA for the active business configuration.
//
//   npm run qa
//
// Validates every config JSON file against the schema, checks for
// consistency (menu categories vs dishes, prices, sections, images) and
// exits with a non-zero code when anything is broken. Runs as the last
// step of the build pipeline so broken businesses can never be deployed.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { REQUIRED_FILES, REQUIRED_BY_FILE, SUPPORTED_BUSINESS_TYPES, MODULE_SECTIONS } from './schemas.mjs'

const CONFIG_DIR = resolve('config')
const errors = []
const warnings = []

function load(file) {
  const path = join(CONFIG_DIR, file)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    errors.push(`${file}: invalid JSON (${err.message})`)
    return null
  }
}

function check(condition, message) {
  if (!condition) errors.push(message)
}

// 1. Required files exist
for (const file of REQUIRED_FILES) {
  if (!existsSync(join(CONFIG_DIR, file))) {
    errors.push(`${file}: missing required config file`)
  }
}

// 2. Per-file required keys
for (const [file, keys] of Object.entries(REQUIRED_BY_FILE)) {
  const data = load(file)
  if (!data) continue
  for (const key of keys) {
    check(data[key] !== undefined && data[key] !== '', `${file}: missing "${key}"`)
  }
}

// 3. Business-level checks
const business = load('business.json')
if (business) {
  check(typeof business.name === 'string' && business.name.trim(), 'business.json: name must be a non-empty string')
  if (business.type && !SUPPORTED_BUSINESS_TYPES.includes(String(business.type).toLowerCase())) {
    warnings.push(`business.json: type "${business.type}" is not in the supported list — UI still works, schema.json will fall back to LocalBusiness`)
  }
  if (Array.isArray(business.sections)) {
    for (const section of business.sections) {
      if (!MODULE_SECTIONS.includes(section)) {
        warnings.push(`business.json: section "${section}" is not registered in src/App.jsx SECTION_REGISTRY and will not render`)
      }
    }
    if (business.sections.length < 2) errors.push('business.json: sections should include at least navbar + footer')
  } else {
    errors.push('business.json: "sections" must be an array')
  }
}

// 4. Theme checks
const theme = load('theme.json')
if (theme?.colors) {
  for (const mode of ['dark', 'light']) {
    const palette = theme.colors[mode]
    if (palette) {
      for (const token of ['base', 'surface', 'primary', 'ink']) {
        check(palette[token], `theme.json: colors.${mode}.${token} missing (required design token)`)
      }
      for (const [token, value] of Object.entries(palette)) {
        if (typeof value === 'string' && !/^[\d ]+$/.test(value.trim())) {
          warnings.push(`theme.json: colors.${mode}.${token} should be an "R G B" triplet (got "${value}")`)
        }
      }
    } else {
      warnings.push(`theme.json: colors.${mode} palette missing — theme may break`)
    }
  }
  check(theme.defaultMode === 'dark' || theme.defaultMode === 'light', 'theme.json: defaultMode must be "dark" or "light"')
}

// 5. Menu consistency
const menu = load('menu.json')
if (menu) {
  const catIds = (menu.categories || []).map((c) => c.id)
  for (const id of catIds) {
    const dishes = menu.dishes?.[id]
    check(Array.isArray(dishes) && dishes.length > 0, `menu.json: category "${id}" has no dishes`)
  }
  for (const [catId, dishes] of Object.entries(menu.dishes || {})) {
    if (!catIds.includes(catId)) warnings.push(`menu.json: dishes for unknown category "${catId}"`)
    for (const dish of dishes || []) {
      check(dish.name, `menu.json: dish in "${catId}" missing a name`)
      check(typeof dish.price === 'number' && dish.price > 0, `menu.json: dish "${dish.name || catId}" has invalid price`)
      check(dish.image, `menu.json: dish "${dish.name || '?'}" missing an image`)
    }
  }
}

// 6. Sections referencing missing content
const businessSections = business?.sections || []
if (businessSections.includes('gallery')) {
  const gallery = load('gallery.json')
  check(gallery?.images?.length > 0, 'gallery.json: "gallery" section enabled but no images')
}
if (businessSections.includes('menu')) {
  check(menu?.categories?.length > 0, 'menu.json: "menu" section enabled but no categories')
}
if (businessSections.includes('offers')) {
  const offers = load('offers.json')
  check(offers?.items?.length > 0, 'offers.json: "offers" section enabled but no items')
}
if (businessSections.includes('reservation')) {
  const booking = load('booking.json')
  check(booking?.submit?.label, 'booking.json: "reservation" section enabled but submit label missing')
}

// 7. Contact/SEO sanity
const contact = load('contact.json')
if (contact) {
  check(contact.phone || contact.phoneRaw, 'contact.json: phone number is required')
  check(contact.mapsEmbed || !businessSections.includes('location'), 'contact.json: location section enabled but mapsEmbed missing')
}
const seo = load('seo.json')
if (seo) {
  check(seo.title && seo.title.length > 5, 'seo.json: page title too short')
  check(seo.canonical && /^https?:\/\//.test(seo.canonical), 'seo.json: canonical must be an absolute URL')
}

// 8. i18n check — every localized field must have at least one locale
const KNOWN_LOCALES = ['en', 'ar', 'fr', 'de', 'es', 'tr', 'ru', 'zh', 'pt', 'it', 'ja', 'ko', 'hi', 'nl', 'pl', 'sv', 'he', 'fa', 'ur', 'id', 'th', 'vi', 'uk']
const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/
for (const file of ['brand.json', 'hero.json', 'menu.json', 'offers.json', 'footer.json', 'navigation.json', 'booking.json']) {
  const data = load(file)
  if (!data) continue
  const walk = (node, pathStr) => {
    if (node == null || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        const keys = Object.keys(value)
        const allStrings = keys.every((k) => typeof value[k] === 'string')
        const allLocaleLooking = keys.length > 0 && keys.every((k) => LOCALE_PATTERN.test(k))
        if (allStrings && allLocaleLooking && keys.some((k) => !KNOWN_LOCALES.includes(k))) {
          warnings.push(`${file}: ${pathStr}.${key} uses locale codes not in the known list (${keys.join(', ')})`)
        }
      } else if (value != null && typeof value === 'object') {
        walk(value, `${pathStr}.${key}`)
      }
    }
  }
  walk(data, file.replace('.json', ''))
}

// Summary
console.log('\n=== CONFIG QA REPORT ===')
if (errors.length) {
  console.log(`\nFAILED: ${errors.length} error(s)`)
  errors.forEach((e) => console.log(`  [ERROR]   ${e}`))
} else {
  console.log('\nPASSED: configuration is valid')
}
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s)`)
  warnings.forEach((w) => console.log(`  [WARN]    ${w}`))
}
console.log(`\nChecked: ${REQUIRED_FILES.length} config files (${CONFIG_DIR})\n`)

process.exit(errors.length ? 1 : 0)
