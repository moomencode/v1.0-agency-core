// AgencyOS/tests/e2e-08-reservation.mjs
// ---------------------------------------------------------------------------
// E2E-08 regression: reservation UX / backend TODO.
//
// Finding: src/sections/Reservation.jsx shipped the production defect:
//   - "// TODO: connect to real reservation API/backend."
//   - console.log('Reservation request:', form)
//   - alert(t(booking?.success) || ...)
// executed on EVERY submit, and the success alert fired even when the
// WhatsApp handoff could not be performed (no number / popup blocked) —
// a fake success state.
//
// Intended contract (repository evidence, not invented):
//   - AgencyOS/reports/PHASE4_3_WEBSITE_ENGINE_IMPLEMENTATION.md: "booking
//     (WhatsApp form - no backend)" — there is NO reservation backend.
//   - AgencyOS/website-engine/export/site-script.js is the reference
//     implementation: preventDefault, phone validation, config-driven
//     WhatsApp (wa.me) handoff, inline feedback, and NO alert() /
//     console.log() / TODO anywhere.
//   - booking.json.method = "whatsapp" (garcia, cafe-luna, template).
//
// Fix: Reservation.jsx now reports the handoff outcome inline (config
// booking.success on success, a generic fallback on failure), removes
// alert()/console.log()/TODO, and never claims success unless window.open
// actually returned a handle.
//
// The suite proves the contract statically + from config — deterministic
// in Node, no browser required:
//   - production reservation code has no alert/console.log/TODO,
//   - the whatsapp handoff is config-driven (number, digits, message),
//   - inline success/error feedback exists,
//   - zero hardcoded business tokens in the reservation source,
//   - both businesses + template declare the whatsapp method + copy,
//   - isolation: each business's contact data carries no other tokens,
//   - the engine reference script is equally alert/console-free.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

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

const readJson = (rel) => JSON.parse(readFileSync(path.join(REPO, rel), 'utf8'))
const readText = (rel) => readFileSync(path.join(REPO, rel), 'utf8')

// ---- 0. Production reservation code contract ----
console.log('== e2e-08 production reservation code ==')
const res = readText('src/sections/Reservation.jsx')
check(!res.includes('alert('), 'Reservation.jsx contains no alert()')
check(!res.includes('console.log'), 'Reservation.jsx contains no console.log()')
check(!/TODO|FIXME/.test(res), 'Reservation.jsx contains no stale TODO/FIXME placeholder')
check(!res.includes('method === \'console\''), 'no legacy "console" demo method branch remains')

check(res.includes("booking?.method === 'whatsapp'"), 'whatsapp handoff branch present')
check(res.includes('window.open(`https://wa.me/'), 'wa.me link constructed from config')
check(res.includes('encodeURIComponent('), 'message URL-encoded')
check(res.includes('booking.target'), 'handoff target resolution starts from booking.target')
check(res.includes('contact?.whatsapp'), 'handoff number falls back to contact.whatsapp')
check(res.includes('contact?.phoneRaw'), 'handoff number falls back to contact.phoneRaw')
check(res.includes('setStatus(') && res.includes('status.ok'), 'inline status feedback state wired')
check(res.includes('booking?.success'), 'success copy comes from booking.json')
check(res.includes('business?.phoneDigits'), 'phone validation length config-derived')
check(res.includes('booking?.maxGuests'), 'guest cap config-derived')
check(res.includes('handedOff = !!window.open('), 'success gated on an actual window.open handle')

// ---- 1. No hardcoded business data in the reservation source ----
console.log('== e2e-08 genericity ==')
check(!/garcia/i.test(res), 'Reservation.jsx contains no garcia token')
check(!/cafe[- ]?luna/i.test(res), 'Reservation.jsx contains no cafe-luna token')

// ---- 2. Config contract: whatsapp method + copy for every business ----
console.log('== e2e-08 booking.json contract ==')
for (const b of ['garcia', 'cafe-luna', '_template']) {
  const booking = readJson(`businesses/${b}/config/booking.json`)
  check(booking.method === 'whatsapp', `${b}: booking.method = "whatsapp"`)
  check(typeof booking.success === 'string' && booking.success.length > 0, `${b}: booking.success copy present`)
  check(typeof booking.note === 'string' && booking.note.length > 0, `${b}: booking.note copy present`)
  check(typeof booking.phoneError === 'string' && booking.phoneError.length > 0, `${b}: booking.phoneError copy present`)
}

// ---- 3. Business isolation: numbers exist and carry no cross tokens ----
console.log('== e2e-08 isolation ==')
const garciaContact = readJson('businesses/garcia/config/contact.json')
const lunaContact = readJson('businesses/cafe-luna/config/contact.json')
check(/^\+20[\d\s]{9,15}$/.test(String(garciaContact.whatsapp || '')), 'garcia whatsapp number present')
  check(/^\+20[\d\s]{9,15}$/.test(String(lunaContact.whatsapp || '')), 'cafe-luna whatsapp number present')
check(garciaContact.whatsapp !== lunaContact.whatsapp, 'businesses use distinct whatsapp numbers')
check(!JSON.stringify(garciaContact).includes('Cafe Luna'), 'garcia contact carries no cafe-luna token')
check(!JSON.stringify(lunaContact).includes('Garcia'), 'cafe-luna contact carries no garcia token')
check(readJson('businesses/garcia/config/business.json').phoneDigits === 11, 'garcia phoneDigits = 11')
check(readJson('businesses/cafe-luna/config/business.json').phoneDigits === 11, 'cafe-luna phoneDigits = 11')

// ---- 4. Engine reference contract stays clean (WhatsApp, no backend) ----
console.log('== e2e-08 engine reference parity ==')
const siteScript = readText('AgencyOS/website-engine/export/site-script.js')
check(!siteScript.includes('alert('), 'engine site-script has no alert()')
check(!siteScript.includes('console.'), 'engine site-script has no console.* call')
check(!/TODO|FIXME/.test(siteScript), 'engine site-script has no TODO/FIXME')
check(siteScript.includes('encodeURIComponent(') && siteScript.includes('window.open('), 'engine reference performs the WhatsApp handoff')

console.log(`\ne2e-08 reservation: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)