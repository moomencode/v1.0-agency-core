// AgencyOS/tests/e2e-02-business-fidelity.mjs
// ---------------------------------------------------------------------------
// E2E-02 regression: business config fidelity / cross-business data isolation.
//
// Guards the production fix for Cafe-Luna inheriting Garcia business data:
//   1. businesses/cafe-luna/config/*.json must contain ONLY Cafe-Luna data.
//   2. businesses/garcia/config/*.json must remain Garcia data, unchanged.
//   3. Shared/generic configs (UX copy, i18n, stock media) may be identical
//      across businesses; business-specific files must NOT be.
//   4. The scaffolder (scripts/new-business.mjs) must seed from the neutral
//      businesses/_template/config, never from an active business.
//   5. The full chain holds: business source config -> rendered site output.
//
// Provenance (E2E-02 forensics): root businesses/*/config are the
// authoritative per-business source (no agency module writes them; the
// agency pipeline emits into its own storage). The scaffolder copied the
// ACTIVE business's config as the scaffold, which is how garcia data entered
// cafe-luna. This suite pins the corrected behavior end to end.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BUSINESSES = path.join(REPO, 'businesses')
const TEMPLATE_CONFIG = path.join(BUSINESSES, '_template', 'config')
const QA_SCRIPT = path.join(REPO, 'scripts', 'qa.mjs')
const SCAFFOLDER = path.join(REPO, 'scripts', 'new-business.mjs')

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

const GENERIC_ALLOWLIST = ['i18n.json', 'navigation.json', 'booking.json', 'faq.json', 'services.json', 'gallery.json']
const LEAKED_FILES = ['offers.json', 'features.json', 'footer.json']

const GARCIA_TOKENS = [
  'Garcia', 'garcia', 'garcia.example.com', 'Heliopolis', '+20 123 456 5678',
  'info@garcia.com.eg', 'Chicken Alfredo', 'Garcia Classic Burger',
  'Garcia Executive Combo', 'The Garcia experience', 'Good Food', 'Good Mood',
]
const CAFE_LUNA_TOKENS = [
  'Cafe Luna', 'LUNA', 'cafe-luna.example.com', 'Zamalek', '12 Brazil',
  '+20 100 200 3450', 'hello@cafeluna.com.eg', 'cafeluna', 'Mona Adel',
  'Morning Ritual Combo', 'The Cafe Luna experience',
]

function configTexts(businessName) {
  const dir = path.join(BUSINESSES, businessName, 'config')
  const out = {}
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.json')) out[file] = readFileSync(path.join(dir, file), 'utf8')
  }
  return out
}

function runQa(configDir) {
  const sb = mkdtempSync(path.join(tmpdir(), 'e2e-02-qa-'))
  mkdirSync(path.join(sb, 'config'))
  for (const file of readdirSync(configDir)) {
    if (file.endsWith('.json')) cpSync(path.join(configDir, file), path.join(sb, 'config', file))
  }
  const res = spawnSync(process.execPath, [QA_SCRIPT], { cwd: sb, encoding: 'utf8' })
  rmSync(sb, { recursive: true, force: true })
  return res.status
}

function renderSite(businessName) {
  const sb = path.join(REPO, 'node_modules', `.e2e-02-render-${businessName}-${process.pid}`)
  rmSync(sb, { recursive: true, force: true })
  mkdirSync(sb, { recursive: true })
  for (const rel of ['src', 'index.html', 'vite.config.js']) {
    cpSync(path.join(REPO, rel), path.join(sb, rel), { recursive: true })
  }
  const sbScripts = path.join(sb, 'scripts')
  mkdirSync(sbScripts)
  cpSync(path.join(REPO, 'scripts', 'seo-head-plugin.mjs'), path.join(sbScripts, 'seo-head-plugin.mjs'))
  mkdirSync(path.join(sb, 'config'))
  mkdirSync(path.join(sb, 'assets'))
  for (const file of readdirSync(path.join(BUSINESSES, businessName, 'config'))) {
    if (file.endsWith('.json')) cpSync(path.join(BUSINESSES, businessName, 'config', file), path.join(sb, 'config', file))
  }
  for (const dir of readdirSync(path.join(BUSINESSES, businessName, 'assets'))) {
    cpSync(path.join(BUSINESSES, businessName, 'assets', dir), path.join(sb, 'assets', dir), { recursive: true })
  }

  const renderScript = path.join(sb, 'render.mjs')
  writeFileSync(renderScript, `
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'
const server = await createServer({ root: '${sb.replace(/\\/g, '/')}', server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
try {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  const html = renderToString(React.createElement(App))
  writeFileSync('${path.join(sb, 'output.html').replace(/\\/g, '/')}', html)
} finally {
  await server.close()
}
`)
  const res = spawnSync(process.execPath, [renderScript], { cwd: REPO, encoding: 'utf8' })
  const html = existsSync(path.join(sb, 'output.html')) ? readFileSync(path.join(sb, 'output.html'), 'utf8') : ''
  rmSync(sb, { recursive: true, force: true })
  if (res.status !== 0 || !html) {
    return { ok: false, html: '', err: res.stderr || res.stdout || `exit ${res.status}` }
  }
  return { ok: true, html }
}

const sandboxes = []
try {
  console.log('== e2e-02 config validation (qa) ==')
  for (const name of ['garcia', 'cafe-luna', '_template']) {
    const dir = name === '_template' ? TEMPLATE_CONFIG : path.join(BUSINESSES, name, 'config')
    check(runQa(dir) === 0, `${name}: config passes npm run qa`)
  }

  console.log('== e2e-02 cross-business contamination (config level) ==')
  const garcia = configTexts('garcia')
  const cafeLuna = configTexts('cafe-luna')
  const allGarcia = Object.values(garcia).join('\n')
  const allCafeLuna = Object.values(cafeLuna).join('\n')

  for (const token of CAFE_LUNA_TOKENS) {
    check(!allGarcia.includes(token), `garcia configs contain no Cafe-Luna token "${token}"`)
  }
  for (const token of GARCIA_TOKENS) {
    check(!allCafeLuna.includes(token), `cafe-luna configs contain no Garcia token "${token}"`)
  }

  console.log('== e2e-02 byte-identical classification ==')
  for (const file of Object.keys(garcia)) {
    if (!cafeLuna[file]) continue
    const identical = garcia[file] === cafeLuna[file]
    if (identical) {
      check(GENERIC_ALLOWLIST.includes(file), `${file}: byte-identical between businesses and allowed as generic`)
    }
  }
  for (const file of LEAKED_FILES) {
    check(garcia[file] !== cafeLuna[file], `${file}: no longer byte-identical (leak fixed)`)
  }

  console.log('== e2e-02 identity content (source configs) ==')
  check(garcia['offers.json'].includes('Garcia Executive Combo'), 'garcia offers keep Garcia-specific content')
  check(garcia['features.json'].includes('The Garcia experience'), 'garcia features keep Garcia-specific heading')
  check(garcia['seo.json'].includes('garcia.example.com'), 'garcia canonical unchanged')
  check(cafeLuna['offers.json'].includes('Morning Ritual Combo'), 'cafe-luna offers contain Cafe-Luna offer')
  check(cafeLuna['offers.json'].includes('Pour Over Tasting'), 'cafe-luna offers contain Cafe-Luna offer 2')
  check(cafeLuna['features.json'].includes('The Cafe Luna experience'), 'cafe-luna features heading is Cafe-Luna specific')
  check(cafeLuna['footer.json'].includes('Zamalek'), 'cafe-luna footer uses Cafe-Luna copy')
  check(cafeLuna['seo.json'].includes('cafe-luna.example.com'), 'cafe-luna canonical unchanged')

  console.log('== e2e-02 scaffolder seeds from neutral template ==')
  const sb = mkdtempSync(path.join(tmpdir(), 'e2e-02-scaffold-'))
  sandboxes.push(sb)
  const sbTemplate = path.join(sb, 'businesses', '_template', 'config')
  mkdirSync(sbTemplate, { recursive: true })
  for (const file of readdirSync(TEMPLATE_CONFIG)) {
    cpSync(path.join(TEMPLATE_CONFIG, file), path.join(sbTemplate, file))
  }
  const scaf = spawnSync(process.execPath, [SCAFFOLDER, 'scaffold-test'], { cwd: sb, encoding: 'utf8' })
  const scafDir = path.join(sb, 'businesses', 'scaffold-test', 'config')
  check(scaf.status === 0, 'new:business scaffolds successfully (exit 0)')
  check(existsSync(scafDir), 'scaffold config folder created')
  const scafFiles = existsSync(scafDir) ? readdirSync(scafDir) : []
  check(scafFiles.filter((f) => f.endsWith('.json')).length === 19, `scaffold has 19 config files (got ${scafFiles.length})`)
  const scaffoldAll = scafFiles.map((f) => readFileSync(path.join(scafDir, f), 'utf8')).join('\n')
  for (const token of [...GARCIA_TOKENS, ...CAFE_LUNA_TOKENS]) {
    check(!scaffoldAll.includes(token), `scaffold contains no business-specific token "${token}"`)
  }
  check(runQa(scafDir) === 0, 'scaffold config passes npm run qa')

  console.log('== e2e-02 rendered output chain ==')
  for (const name of ['garcia', 'cafe-luna']) {
    const r1 = renderSite(name)
    check(r1.ok, `${name}: site renders via vite SSR (${r1.err || 'ok'})`)
    if (!r1.ok) continue
    if (name === 'garcia') {
      check(r1.html.includes('Garcia Executive Combo'), 'garcia render shows Garcia offer')
      check(!r1.html.includes('Cafe Luna'), 'garcia render contains no Cafe-Luna identity')
      check(!r1.html.includes('cafe-luna.example.com'), 'garcia render contains no Cafe-Luna canonical')
      const r2 = renderSite(name)
      check(r2.ok && r2.html === r1.html, 'garcia render is byte-deterministic')
    } else {
      check(r1.html.includes('Cafe Luna'), 'cafe-luna render shows Cafe-Luna identity')
      check(r1.html.includes('Morning Ritual Combo'), 'cafe-luna render shows Cafe-Luna offer (no Garcia combo)')
      check(!/garcia/i.test(r1.html), 'cafe-luna render contains zero "garcia" (case-insensitive)')
      check(!r1.html.includes('garcia.example.com'), 'cafe-luna render contains no Garcia canonical')
      const r2 = renderSite(name)
      check(r2.ok && r2.html === r1.html, 'cafe-luna render is byte-deterministic')
    }
  }
} finally {
  for (const sb of sandboxes) {
    try {
      rmSync(sb, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
}

console.log(`\ne2e-02-business-fidelity: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
