// AgencyOS/tests/e2e-05-ssr-smoke.mjs
// ---------------------------------------------------------------------------
// E2E-05 regression: generic SSR smoke helper (scripts/ssr-smoke.mjs).
//
// Guards the production fix for the broken helper:
//   - old: bare-ESM import of src/App.jsx crashed on Node 24 with
//     ERR_UNKNOWN_FILE_EXTENSION (.jsx) and hardcoded a "GARCIA" check.
//   - new: renders the ACTIVE business through Vite's real SSR loader,
//     takes an optional business argument, and checks sections / identity /
//     canonical / cross-business leakage — all config-derived, nothing
//     hardcoded.
//
// The suite EXECUTES the real helper (spawn) against the real repository:
//   - active-config run (garcia) and explicit-argument run both pass,
//   - mismatch / unknown-business arguments fail deterministically (exit 1),
//   - a byte-exact config swap to cafe-luna lets the helper smoke cafe-luna,
//     after which config/ is restored byte-for-byte (hash-verified).
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const HELPER = path.join(REPO, 'scripts', 'ssr-smoke.mjs')
const CONFIG_DIR = path.join(REPO, 'config')
const BUSINESSES = path.join(REPO, 'businesses')

let passed = 0
let failed = 0
const fail = (msg) => {
  failed++
  console.log('FAIL ' + msg)
}
const pass = (msg) => {
  passed++
  console.log('PASS ' + msg)
}
const check = (cond, msg) => (cond ? pass(msg) : fail(msg))

const runHelper = (args = []) => spawnSync(process.execPath, [HELPER, ...args], { cwd: REPO, encoding: 'utf8' })
const readJson = (rel) => JSON.parse(readFileSync(path.join(REPO, rel), 'utf8'))

function snapshotConfig() {
  const files = readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'))
  const map = new Map()
  for (const f of files) map.set(f, readFileSync(path.join(CONFIG_DIR, f)))
  return map
}
function restoreConfig(original) {
  for (const [file, bytes] of original) writeFileSync(path.join(CONFIG_DIR, file), bytes)
}
function hashDir(map) {
  const h = createHash('sha256')
  for (const [file, bytes] of [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    h.update(file).update(bytes)
  }
  return h.digest('hex')
}

// ---- 0. Source-level genericity guard (additional guard on the helper) ----
const source = readFileSync(HELPER, 'utf8')
check(!/garcia/i.test(source), 'ssr-smoke.mjs contains no hardcoded garcia tokens (case-insensitive)')
check(!/cafe[- ]?luna/i.test(source), 'ssr-smoke.mjs contains no hardcoded cafe-luna tokens')
check(!source.includes('GARCIA'), 'ssr-smoke.mjs contains no "GARCIA" constant')

const originalConfig = snapshotConfig()
let swapped = false
try {
  const activeBusiness = readJson('config/business.json')
  const activeBrand = readJson('config/brand.json')
  const activeSeo = readJson('config/seo.json')
  const activeNavigation = readJson('config/navigation.json')

  // ---- 1. Real run against the ACTIVE config (no argument) ----
  console.log('== e2e-05 active-config smoke (no argument) ==')
  const resActive = runHelper()
  check(resActive.status === 0, `helper exits 0 against active config (got ${resActive.status})`)
  check(resActive.stdout.includes('SSR SMOKE OK'), 'helper reports "SSR SMOKE OK"')
  check(
    resActive.stdout.includes(`SSR SMOKE OK — ${activeBusiness.name}`),
    `helper reports the active business name ("${activeBusiness.name}")`
  )
  for (const item of activeNavigation.items || []) {
    if (item.href && item.href.startsWith('#')) {
      const id = item.href.slice(1)
      check(resActive.stdout.includes(`section #${id} rendered`), `helper verifies section #${id}`)
    }
  }
  check(
    resActive.stdout.includes(`canonical is a valid https URL (${activeSeo.canonical})`),
    `helper verifies the active canonical (${activeSeo.canonical})`
  )
  check(resActive.stdout.includes(`identity "${activeBusiness.name}" present`), `helper verifies active identity "${activeBusiness.name}"`)
  check(resActive.stdout.includes(`slogan "${activeBrand.slogan}" present`), `helper verifies active slogan "${activeBrand.slogan}"`)

  // ---- 2. Explicit business argument matching the active config ----
  console.log('== e2e-05 explicit argument (matching active) ==')
  const resExplicit = runHelper(['garcia'])
  check(resExplicit.status === 0, 'helper exits 0 with explicit matching business arg')
  check(resExplicit.stdout.includes('SSR target: garcia (active config matches)'), 'helper confirms the requested business matches the active config')

  // ---- 3. Deterministic failure: business arg mismatching active config ----
  console.log('== e2e-05 deterministic failure (mismatch) ==')
  const resMismatch = runHelper(['cafe-luna'])
  check(resMismatch.status === 1, 'helper exits 1 when the requested business is not the active config')
  check(resMismatch.stderr.includes('cafe-luna'), 'mismatch message names the requested business')
  check(resMismatch.stderr.includes('build:business -- cafe-luna'), 'mismatch message suggests the build command')

  // ---- 4. Deterministic failure: unknown business ----
  console.log('== e2e-05 deterministic failure (unknown business) ==')
  const resUnknown = runHelper(['does-not-exist'])
  check(resUnknown.status === 1, 'helper exits 1 for an unknown business name')
  check(resUnknown.stderr.includes('does-not-exist'), 'unknown-business message names the argument')

  // ---- 5. Cafe-Luna smoke via byte-exact config swap ----
  console.log('== e2e-05 cafe-luna smoke (byte-exact config swap) ==')
  const cafeConfigDir = path.join(BUSINESSES, 'cafe-luna', 'config')
  const cafeSeo = readJson('businesses/cafe-luna/config/seo.json')
  const cafeBusiness = readJson('businesses/cafe-luna/config/business.json')
  const cafeBrand = readJson('businesses/cafe-luna/config/brand.json')
  for (const file of readdirSync(cafeConfigDir).filter((f) => f.endsWith('.json'))) {
    writeFileSync(path.join(CONFIG_DIR, file), readFileSync(path.join(cafeConfigDir, file)))
  }
  swapped = true
  const resCafe = runHelper(['cafe-luna'])
  check(resCafe.status === 0, `helper exits 0 with cafe-luna active (got ${resCafe.status})`)
  check(resCafe.stdout.includes(`SSR SMOKE OK — ${cafeBusiness.name}`), `helper reports Cafe-Luna identity (${cafeBusiness.name})`)
  check(resCafe.stdout.includes(`identity "${cafeBusiness.name}" present`), 'helper verifies Cafe-Luna identity')
  check(resCafe.stdout.includes(`slogan "${cafeBrand.slogan}" present`), `helper verifies Cafe-Luna slogan ("${cafeBrand.slogan}")`)
  check(resCafe.stdout.includes(`canonical is a valid https URL (${cafeSeo.canonical})`), `helper verifies Cafe-Luna canonical (${cafeSeo.canonical})`)
  check(resCafe.stdout.includes('no leak from "Garcia Restaurant & Cafe"'), 'helper verifies zero Garcia leakage in Cafe-Luna HTML')

  // ---- 6. Config restore is byte-exact ----
  console.log('== e2e-05 config integrity after swap ==')
  const afterRestore = snapshotConfig()
  restoreConfig(originalConfig)
  check(hashDir(afterRestore) !== hashDir(originalConfig), 'config/ actually changed during the swap (swap was effective)')
  const finalConfig = snapshotConfig()
  check(hashDir(finalConfig) === hashDir(originalConfig), 'config/ restored byte-for-byte after the cafe-luna smoke')
  swapped = false
} finally {
  if (swapped) {
    restoreConfig(originalConfig)
    console.log('WARN restored config/ from backup (test failure path)')
  }
}

console.log(`\ne2e-05-ssr-smoke: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
