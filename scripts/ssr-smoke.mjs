// scripts/ssr-smoke.mjs
// ---------------------------------------------------------------------------
// E2E-05: generic SSR smoke helper for the multi-business build system.
//
//   node scripts/ssr-smoke.mjs [businessName]
//
// Renders the ACTIVE business (the config/ currently swapped in by the build
// mechanism, e.g. npm run build:business -- <name>) with the REAL Vite SSR
// loader and smoke-checks the server-rendered body HTML:
//
//   1. The app imports and renders without crashing (Node-24-safe JSX/CSS/
//      JSON handling via Vite's ssrLoadModule).
//   2. Every section id declared by config/navigation.json is rendered.
//   3. The business identity (config/business.json name + config/brand.json
//      slogan) is present in the rendered HTML.
//   4. The active business canonical (config/seo.json) is a valid https URL.
//   5. No OTHER business's identity or canonical leaks into the HTML
//      (business list discovered from businesses/ — nothing hardcoded).
//
// If [businessName] is given, the helper verifies that the active config IS
// that business (canonical + name compared against
// businesses/<businessName>/config) and fails with a clear message if not.
// Head-tag metadata (title/OG/JSON-LD in raw index.html) is out of scope —
// that contract is owned by the e2e-03 suite; this helper stays a smoke test.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'

const ROOT = process.cwd()
const request = process.argv[2]

let passed = 0
const pass = (msg) => {
  passed++
  console.log('PASS ' + msg)
}
const fail = (msg) => {
  console.error('SSR FAIL: ' + msg)
  process.exit(1)
}

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

// HTML-escape mirror (renderToString escapes & < > in text content).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const containsEscaped = (html, value) => html.includes(value) || html.includes(esc(value))

// Active business configs (source of truth for the smoke contract).
const configDir = join(ROOT, 'config')
if (!existsSync(join(configDir, 'business.json'))) fail(`no business config at ${configDir} (run from the project root)`)
const business = readJson('config/business.json')
const brand = readJson('config/brand.json')
const seo = readJson('config/seo.json')
const navigation = readJson('config/navigation.json')

const activeName = business.name || brand.name || ''

// Optional business argument: prove the active config IS that business.
if (request) {
  const bizDir = join(ROOT, 'businesses', request)
  if (!existsSync(bizDir) || !existsSync(join(bizDir, 'config'))) {
    fail(`unknown business "${request}" (no businesses/${request}/config)`)
  }
  const bizSeo = readJson(`businesses/${request}/config/seo.json`)
  const bizBusiness = readJson(`businesses/${request}/config/business.json`)
  const expectCanonical = String(bizSeo.canonical || '').replace(/\/$/, '')
  const activeCanonical = String(seo.canonical || '').replace(/\/$/, '')
  if (expectCanonical && expectCanonical !== activeCanonical) {
    fail(`active config is not "${request}" (canonical ${activeCanonical || '(none)'} !== ${expectCanonical}); run: npm run build:business -- ${request}`)
  }
  if (bizBusiness.name && bizBusiness.name !== business.name) {
    fail(`active config is not "${request}" (name "${business.name || ''}" !== "${bizBusiness.name}"); run: npm run build:business -- ${request}`)
  }
  console.log(`SSR target: ${request} (active config matches)`)
} else {
  console.log(`SSR target: active config (${activeName || 'unknown name'})`)
}

// Other real businesses (dirs in businesses/ that are not scaffolds).
const otherBusinesses = readdirSync(join(ROOT, 'businesses'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => {
    const cfg = join(ROOT, 'businesses', d.name, 'config')
    if (!existsSync(join(cfg, 'business.json')) || !existsSync(join(cfg, 'seo.json'))) return null
    const b = JSON.parse(readFileSync(join(cfg, 'business.json'), 'utf8'))
    const s = JSON.parse(readFileSync(join(cfg, 'seo.json'), 'utf8'))
    return { name: b.name, canonical: s.canonical }
  })
  .filter(Boolean)

let html = ''
let server
try {
  server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  html = renderToString(React.createElement(App))
} catch (err) {
  fail(`render crash: ${err && err.stack ? err.stack : err}`)
} finally {
  if (server) await server.close()
}

// 1. Sections declared by the active navigation config.
const anchors = (navigation.items || []).map((i) => i.href).filter((h) => h && h.startsWith('#'))
for (const href of anchors) {
  const id = href.slice(1)
  if (html.includes(`id="${id}"`)) pass(`section #${id} rendered`)
  else fail(`section #${id} not found in rendered HTML`)
}

// 2. Business identity present.
if (activeName) passOrFail(`identity "${activeName}" present`, containsEscaped(html, activeName))
const slogan = brand.slogan || ''
if (slogan) passOrFail(`slogan "${slogan}" present`, containsEscaped(html, slogan))

// 3. Canonical sanity (head metadata itself is the e2e-03 contract).
const canonical = String(seo.canonical || '')
passOrFail(`canonical is a valid https URL (${canonical || '(empty)'})`, /^https:\/\/\S+$/.test(canonical))

// 4. No other business leaks in.
for (const other of otherBusinesses) {
  if (other.name === activeName && other.canonical === canonical) continue
  const lower = html.toLowerCase()
  const nameLeak = other.name ? lower.includes(String(other.name).toLowerCase()) : false
  const canonicalLeak = other.canonical ? lower.includes(String(other.canonical).toLowerCase()) : false
  if (nameLeak) fail(`other-business identity leaked: "${other.name}"`)
  if (canonicalLeak) fail(`other-business canonical leaked: ${other.canonical}`)
  pass(`no leak from "${other.name}"`)
}

console.log(`SSR SMOKE OK — ${activeName || 'active business'} (${passed} checks, HTML length ${html.length})`)

function passOrFail(msg, cond) {
  return cond ? pass(msg) : fail(msg)
}
