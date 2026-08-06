// scripts/new-business.mjs
// ---------------------------------------------------------------------------
// Scaffolds a brand-new business folder from the current template.
//
//   npm run new:business -- cafe-luna
//
// Creates businesses/<name>/ with a copy of the default config (as a
// starting point for AI agents to fill in) and an empty assets skeleton.
// ---------------------------------------------------------------------------

import { existsSync, cpSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve('.')
const name = process.argv[2]

if (!name) {
  console.error('Usage: npm run new:business -- <business-name>')
  console.error('Example: npm run new:business -- cafe-luna')
  process.exit(1)
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error('Business name must be lowercase, alphanumeric, with dashes only (e.g. cafe-luna)')
  process.exit(1)
}

const target = join(ROOT, 'businesses', name)
if (existsSync(target)) {
  console.error(`businesses/${name} already exists`)
  process.exit(1)
}

mkdirSync(join(target, 'config'), { recursive: true })
mkdirSync(join(target, 'assets', 'logo'), { recursive: true })
mkdirSync(join(target, 'assets', 'hero'), { recursive: true })
mkdirSync(join(target, 'assets', 'gallery'), { recursive: true })
mkdirSync(join(target, 'assets', 'food'), { recursive: true })
mkdirSync(join(target, 'assets', 'background'), { recursive: true })
mkdirSync(join(target, 'assets', 'icons'), { recursive: true })
mkdirSync(join(target, 'assets', 'videos'), { recursive: true })

// Copy the current (active) config as the scaffold
for (const file of ['business.json', 'brand.json', 'theme.json', 'seo.json', 'social.json', 'contact.json', 'navigation.json', 'hero.json', 'menu.json', 'offers.json', 'gallery.json', 'booking.json', 'features.json', 'services.json', 'stats.json', 'reviews.json', 'faq.json', 'footer.json', 'i18n.json']) {
  cpSync(join(ROOT, 'config', file), join(target, 'config', file), { force: true })
}

writeFileSync(
  join(target, 'README.md'),
  `# ${name}\n\nBusiness scaffold created by the Website Engine.\n\nEdit the files in config/ to define this business, then build with:\n\n    npm run build:business -- ${name}\n`
)

console.log(`\nCreated businesses/${name}/\n`)
console.log('Next steps:')
console.log(`  1. Fill in config/*.json for the business`)
console.log(`  2. Drop media into assets/ (logo/, hero/, gallery/, ...)`)
console.log(`  3. npm run qa                    # validate`)
console.log(`  4. npm run build:business -- ${name}  # build the site`)
console.log('\n')
