// scripts/site.mjs
// ---------------------------------------------------------------------------
// Phase 1: one safe, idempotent command for the verified build+verify chain.
//
//   npm run site -- <business-name>
//
// Envelope around the existing verified pipeline (nothing reimplemented):
//
//   validate arg -> preflight active state -> snapshot config/ + assets/
//     -> node scripts/build-business.mjs <name>   (swap, QA, build, SEO, sitemap, robots)
//     -> node scripts/ssr-smoke.mjs <name>         (SSR identity + leak check)
//     -> restore config/ + assets/ from snapshot   (byte-exact)
//     -> verify restore via SHA-256 comparison
//     -> cleanup snapshot -> PASS/FAIL report
//
// PASS requires: requested business built AND SSR-verified AND original
// active state restored byte-for-byte. A failed restore is a FAIL even when
// the build succeeded. The command is idempotent: snapshot is wiped before
// use and removed after; repeated runs never accumulate files and always
// leave the working tree as it was (dist/ is ignored build output).
// ---------------------------------------------------------------------------

import { existsSync, readdirSync, mkdirSync, rmSync, cpSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'

const ROOT = resolve('.')
const SNAPSHOT = join(ROOT, 'var', 'site-snapshot')

const FAILURE = (msg) => {
  console.error(`\nsite: FAIL — ${msg}`)
  process.exit(1)
}

// --- 1. CLI validation ------------------------------------------------------
const args = process.argv.slice(2)
if (args.length !== 1) {
  console.error('Usage: npm run site -- <business-name>')
  console.error('Example: npm run site -- garcia')
  console.error('         npm run site -- cafe-luna')
  process.exit(1)
}
const name = args[0]
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  FAILURE(`invalid business name "${name}" (use lowercase letters, digits, dashes only)`)
}

// --- 2. Preflight -----------------------------------------------------------
const CONFIG_DIR = join(ROOT, 'config')
const ASSETS_DIR = join(ROOT, 'assets')
if (!existsSync(join(CONFIG_DIR, 'business.json'))) {
  FAILURE(`no active business config at config/ (run from the project root)`)
}

const bizDir = join(ROOT, 'businesses', name)
if (!existsSync(join(bizDir, 'config', 'business.json'))) {
  console.error(`Unknown business: ${name} (no businesses/${name}/config/business.json)`)
  console.error('Available businesses:')
  for (const entry of readdirSync(join(ROOT, 'businesses'), { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('_')) console.error(`  - ${entry.name}`)
  }
  process.exit(1)
}

const run = (cmd, extraArgs, stage) => {
  const res = spawnSync(process.execPath, [cmd, ...extraArgs], { cwd: ROOT, stdio: 'inherit' })
  if (res.status !== 0) {
    restore()
    rmSync(SNAPSHOT, { recursive: true, force: true })
    FAILURE(`${stage} failed (exit ${res.status === null ? 'signal' : res.status})`)
  }
}

// --- 3. Snapshot ------------------------------------------------------------
console.log(`\n=== site: ${name} ===`)
console.log('[snapshot] capturing config/ + assets/ -> var/site-snapshot/')
rmSync(SNAPSHOT, { recursive: true, force: true })
const snapConfig = join(SNAPSHOT, 'config')
const snapAssets = join(SNAPSHOT, 'assets')
mkdirSync(snapConfig, { recursive: true })
mkdirSync(snapAssets, { recursive: true })
for (const f of readdirSync(CONFIG_DIR)) {
  if (f.endsWith('.json')) cpSync(join(CONFIG_DIR, f), join(snapConfig, f))
}
cpSync(ASSETS_DIR, snapAssets, { recursive: true })

// --- 4. Build + --- 5. SSR (existing verified pipeline) ----------------------
run('scripts/build-business.mjs', [name], `build:business for ${name}`)
run('scripts/ssr-smoke.mjs', [name], `ssr-smoke for ${name}`)

restore()

// --- 6. Restore -------------------------------------------------------------
function restore() {
  console.log('\n[restore] restoring original active state...')
  try {
    for (const f of readdirSync(CONFIG_DIR)) {
      if (f.endsWith('.json')) rmSync(join(CONFIG_DIR, f), { force: true })
    }
    for (const f of readdirSync(snapConfig)) {
      cpSync(join(snapConfig, f), join(CONFIG_DIR, f), { force: true })
    }
    rmSync(ASSETS_DIR, { recursive: true, force: true })
    cpSync(snapAssets, ASSETS_DIR, { recursive: true })
  } catch (err) {
    FAILURE(`restore FAILED (${err.message}) — manual intervention required`)
  }
}

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

// --- 7. Verify restore -------------------------------------------------------
console.log('[verify] comparing restored state against snapshot (SHA-256)...')
let restoreOk = true
const compare = (snap, live, label) => {
  const snapFiles = new Set()
  const walkSnap = (dir, rel = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      const r = rel ? join(rel, entry.name) : entry.name
      if (entry.isDirectory()) walkSnap(p, r)
      else snapFiles.add(r)
    }
  }
  walkSnap(snap)
  for (const f of snapFiles) {
    const liveFile = join(live, f)
    if (!existsSync(liveFile)) {
      console.error(`[verify] MISSING after restore: ${label}/${f}`)
      restoreOk = false
      continue
    }
    if (sha(join(snap, f)) !== sha(liveFile)) {
      console.error(`[verify] DIFFERENT after restore: ${label}/${f}`)
      restoreOk = false
    }
  }
  const walkLive = (dir, rel = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      const r = rel ? join(rel, entry.name) : entry.name
      if (entry.isDirectory()) walkLive(p, r)
      else if (!snapFiles.has(r)) {
        console.error(`[verify] EXTRA after restore: ${label}/${r}`)
        restoreOk = false
      }
    }
  }
  walkLive(live)
}
compare(snapConfig, CONFIG_DIR, 'config')
compare(snapAssets, ASSETS_DIR, 'assets')

// --- 8. Cleanup --------------------------------------------------------------
rmSync(SNAPSHOT, { recursive: true, force: true })
console.log('[cleanup] snapshot removed')

if (!restoreOk) {
  console.error('\nsite: FAIL — original active state was NOT restored byte-for-byte')
  process.exit(1)
}

// --- 9. Report ---------------------------------------------------------------
console.log(`\n=== site: ${name} PASS ===`)
console.log('  build:business     OK (QA + build + SEO + sitemap + robots)')
console.log('  ssr-smoke          OK')
console.log('  original state     restored + verified byte-for-byte')
