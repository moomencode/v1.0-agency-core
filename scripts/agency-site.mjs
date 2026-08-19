// scripts/agency-site.mjs
// ---------------------------------------------------------------------------
// GAP 3: ONE-COMMAND PRODUCTION PIPELINE — the canonical user-facing entry
// point of the product goal: ONE INPUT -> ONE COMMAND -> PRODUCTION-READY
// business website.
//
//   npm run agency:site -- <input.json>   # input -> generated business -> production site
//   npm run agency:site -- <slug>         # existing business -> production site
//
// Thin orchestration ONLY — it composes the two EXISTING proven mechanisms
// and reimplements nothing:
//
//   1. scripts/business-generate.mjs <input.json>
//        input validation -> 19 configs + neutral assets -> hermetic QA gate
//        -> atomic rename into businesses/<slug>/
//   2. scripts/site.mjs <slug>
//        snapshot -> swap -> QA -> vite build -> sitemap + robots -> SSR smoke
//        -> byte-exact restore + verify
//
// The slug is derived with the SAME slugify() the generator uses (the
// project's single slugification semantics — imported, never duplicated),
// after the generator has already validated the input.
//
// Contract:
//   - errors propagate with the underlying non-zero exit codes
//   - deterministic (no RNG, no clocks, nothing invented)
//   - the generated business and the final result are printed explicitly
//   - byte-exact restore of config/ + assets/ is owned by site.mjs and kept
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { spawnSync } from 'child_process'
import { slugify } from '../AgencyOS/pipeline/utils.js'

const ROOT = resolve('.')
const FAILURE = (msg) => {
  console.error(`\nagency:site: FAIL — ${msg}`)
  process.exit(1)
}

const run = (script, args) => {
  const res = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit' })
  return res.status === null ? 1 : res.status
}

// --- 1. CLI -----------------------------------------------------------------
const args = process.argv.slice(2)
if (args.length !== 1) {
  console.error('Usage: npm run agency:site -- <input.json>   (or <business-slug>)')
  console.error('Example: npm run agency:site -- var/my-business.json')
  console.error('         npm run agency:site -- garcia')
  process.exit(1)
}
const arg = args[0]

// --- 2. Input mode (file exists -> generate + build) ------------------------
if (existsSync(arg)) {
  console.log(`\n=== agency:site: ${arg} ===`)
  const genStatus = run('scripts/business-generate.mjs', [arg])
  if (genStatus !== 0) {
    FAILURE(`business generation failed (exit ${genStatus}) — input not accepted, nothing to build`)
  }

  let input
  try {
    input = JSON.parse(readFileSync(resolve(arg), 'utf8').replace(/^\uFEFF/, ''))
  } catch (err) {
    FAILURE(`input JSON is invalid (${err.message})`)
  }
  const slug = (typeof input.slug === 'string' && input.slug) ? input.slug : slugify(input.name)
  const name = typeof input.name === 'string' ? input.name : slug

  console.log(`[agency:site] generated business: ${name} (businesses/${slug}/)`)
  const siteStatus = run('scripts/site.mjs', [slug])
  if (siteStatus !== 0) {
    FAILURE(`site pipeline failed for ${slug} (exit ${siteStatus}) — original state restored by site.mjs`)
  }

  console.log(`\n=== agency:site: ${slug} PASS ===`)
  console.log(`  business      ${name} (businesses/${slug}/ — 19 configs + assets, QA-validated)`)
  console.log('  build         dist/ production build (QA + vite + SEO + sitemap + robots)')
  console.log('  ssr           SSR smoke verified (identity, anchors, no cross-business leaks)')
  console.log('  integrity     original config/ + assets/ restored byte-for-byte')
  process.exit(0)
}

// --- 3. Slug mode (existing business -> build) ------------------------------
if (!/^[a-z0-9][a-z0-9-]*$/.test(arg)) {
  FAILURE(`"${arg}" is neither an existing input file nor a valid business slug`)
}
if (!existsSync(resolve('businesses', arg, 'config', 'business.json'))) {
  console.error(`\nagency:site: FAIL — "${arg}" is not an input file and not an existing business`)
  console.error('  Generate a business first with: npm run business:generate -- <input.json>')
  process.exit(1)
}

console.log(`\n=== agency:site: ${arg} ===`)
const siteStatus = run('scripts/site.mjs', [arg])
if (siteStatus !== 0) {
  FAILURE(`site pipeline failed for ${arg} (exit ${siteStatus}) — original state restored by site.mjs`)
}

console.log(`\n=== agency:site: ${arg} PASS ===`)
console.log('  build         dist/ production build (QA + vite + SEO + sitemap + robots)')
console.log('  ssr           SSR smoke verified (identity, anchors, no cross-business leaks)')
console.log('  integrity     original config/ + assets/ restored byte-for-byte')
process.exit(0)