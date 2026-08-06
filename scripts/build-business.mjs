// scripts/build-business.mjs
// ---------------------------------------------------------------------------
// Multi-business build pipeline.
//
//   npm run build:business -- <name>
//
//   1. Copies businesses/<name>/config/*.json      -> config/
//   2. Copies businesses/<name>/assets/*           -> assets/
//   3. Runs the config QA (scripts/qa.mjs)
//   4. Runs vite build
//   5. Generates sitemap.xml into the build output
//
// The default build (`npm run build`) uses the config/ + assets/ folders
// already in the project root — the same pipeline, skipping the copy step.
// ---------------------------------------------------------------------------

import { cpSync, existsSync, readdirSync, rmSync, mkdirSync } from 'fs'
import { resolve, join, basename } from 'path'
import { execSync } from 'child_process'

const ROOT = resolve('.')
const name = process.argv[2]

if (!name) {
  console.error('Usage: npm run build:business -- <business-name>')
  console.error('Example: npm run build:business -- cafe-luna')
  process.exit(1)
}

const srcDir = join(ROOT, 'businesses', name)
if (!existsSync(srcDir)) {
  console.error(`Business folder not found: businesses/${name}`)
  console.error('Create it with: npm run new:business -- <name>')
  process.exit(1)
}

const srcConfig = join(srcDir, 'config')
const srcAssets = join(srcDir, 'assets')

console.log(`\n=== Building business: ${name} ===\n`)

// 1. Swap configuration
if (existsSync(srcConfig)) {
  for (const file of readdirSync(srcConfig)) {
    cpSync(join(srcConfig, file), join(ROOT, 'config', file), { force: true })
  }
  console.log(`  [config]  copied businesses/${name}/config -> config/`)
} else {
  console.error(`  [config]  missing businesses/${name}/config folder`)
  process.exit(1)
}

// 2. Swap assets
if (existsSync(srcAssets)) {
  for (const dir of readdirSync(srcAssets)) {
    rmSync(join(ROOT, 'assets', dir), { recursive: true, force: true })
  }
  for (const dir of readdirSync(srcAssets)) {
    cpSync(join(srcAssets, dir), join(ROOT, 'assets', dir), { recursive: true, force: true })
  }
  console.log(`  [assets]  copied businesses/${name}/assets -> assets/`)
} else {
  console.warn(`  [assets]  no businesses/${name}/assets folder (placeholder images will be used)`)
}

// 3. QA
console.log('  [qa]      validating configuration...')
execSync('node scripts/qa.mjs', { stdio: 'inherit' })

// 4. Build
console.log('  [build]   running vite build...')
execSync('npm run build', { stdio: 'inherit' })

console.log(`\n=== ${name} build complete ===`)
