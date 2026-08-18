// AgencyOS/tests/e2e-07-hours-consistency.mjs
// ---------------------------------------------------------------------------
// E2E-07 regression: Garcia opening-hours consistency.
//
// Finding: businesses/garcia/config/contact.json carried two independent
// hours representations — the structured `hours[]` ("6:00 AM - 1:00 AM",
// corroborated by hero.json info and consumed by Footer + JSON-LD) and the
// display string `hoursShort` ("Daily: 09:00 AM – 01:00 AM", consumed only by
// LocationSection). The opening time disagreed (6:00 vs 09:00) while the
// closing matched — a stale duplicate value, not a format difference.
//
// Fix: garcia `hoursShort` updated to the derived display form of the
// authoritative `hours[]` — "Daily: 06:00 AM – 01:00 AM" (zero-padded +
// en-dash, exactly the pattern cafe-luna already uses). No other surface or
// business changed; hero.json was already consistent and was left untouched.
//
// The suite locks the invariant from every side:
//   - authoritative value: garcia hours[] = "6:00 AM - 1:00 AM" Mon-Sun,
//   - derived strings: hoursShort and hero info match hours[] by time,
//   - no stale Garcia-hours representation anywhere (no 09:00 AM / 9:00 AM
//     in garcia configs or the active config),
//   - JSON-LD (build-time generator) derives from contact.hours and matches,
//   - Cafe-Luna isolation: its own pair stays internally consistent and
//     unchanged in content.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildHeadMetadata } from '../../scripts/seo-head-plugin.mjs'

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

// Parse "6:00 AM" / "01:00 AM" -> minutes since midnight (24h).
function toMinutes(timeStr) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(timeStr))
  if (!m) return null
  let h = Number(m[1]) % 12
  if (/PM/i.test(m[3])) h += 12
  return h * 60 + Number(m[2])
}
function pairOf(text) {
  const times = [...String(text).matchAll(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi)].map((m) => m[1])
  if (times.length < 2) return null
  return [toMinutes(times[0]), toMinutes(times[1])]
}
const samePair = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1]

// ---- 0. Authoritative value (both garcia copies) ----
console.log('== e2e-07 authoritative hours ==')
for (const rel of ['businesses/garcia/config/contact.json', 'config/contact.json']) {
  const contact = readJson(rel)
  check(Array.isArray(contact.hours) && contact.hours.length === 1, `${rel}: hours[] present`)
  check(contact.hours[0].days === 'Monday - Sunday', `${rel}: days = "Monday - Sunday"`)
  check(contact.hours[0].time === '6:00 AM - 1:00 AM', `${rel}: authoritative time = "6:00 AM - 1:00 AM" (got "${contact.hours[0].time}")`)
}

// ---- 1. Derived strings mirror the authoritative pair ----
console.log('== e2e-07 derived surfaces ==')
const garciaContact = readJson('businesses/garcia/config/contact.json')
const authPair = pairOf(garciaContact.hours[0].time)
check(samePair(pairOf(garciaContact.hoursShort), authPair),
  `hoursShort "${garciaContact.hoursShort}" matches hours[] time`)
const hero = readJson('businesses/garcia/config/hero.json')
const clockInfo = (hero.info || []).find((i) => i && /clock/i.test(String(i.icon || '')))
check(!!clockInfo && samePair(pairOf(clockInfo.subtitle), authPair),
  `hero info clock subtitle "${clockInfo && clockInfo.subtitle}" matches hours[] time`)

// ---- 2. No stale Garcia-hours representation anywhere ----
console.log('== e2e-07 no stale representation ==')
const garciaFiles = [
  'businesses/garcia/config/contact.json',
  'businesses/garcia/config/hero.json',
  'config/contact.json',
  'config/hero.json',
]
for (const rel of garciaFiles) {
  const text = readText(rel)
  check(!/0?9:00\s*(AM|PM)/i.test(text), `${rel}: contains no 09:00 AM / 9:00 AM`)
}
const jsonLd = buildHeadMetadata({
  seo: readJson('businesses/garcia/config/seo.json'),
  business: readJson('businesses/garcia/config/business.json'),
  brand: readJson('businesses/garcia/config/brand.json'),
  contact: garciaContact,
  social: readJson('businesses/garcia/config/social.json'),
})
const openingHours = jsonLd.jsonLd && (jsonLd.jsonLd.openingHours || jsonLd.jsonLd[0] && jsonLd.jsonLd[0].openingHours)
check(Array.isArray(openingHours) && openingHours[0] === 'Monday - Sunday 6:00 AM - 1:00 AM',
  `JSON-LD openingHours = "Monday - Sunday 6:00 AM - 1:00 AM" (got "${openingHours}")`)
check(!/09:00/.test(JSON.stringify(jsonLd)), 'JSON-LD contains no stale 09:00 value')

// ---- 3. Cafe-Luna isolation ----
console.log('== e2e-07 cafe-luna isolation ==')
const lunaContact = readJson('businesses/cafe-luna/config/contact.json')
check(lunaContact.hours[0].time === '7:00 AM - 12:00 AM', 'cafe-luna hours[] unchanged ("7:00 AM - 12:00 AM")')
check(samePair(pairOf(lunaContact.hoursShort), pairOf(lunaContact.hours[0].time)),
  `cafe-luna hoursShort "${lunaContact.hoursShort}" matches its hours[]`)
const lunaHero = readJson('businesses/cafe-luna/config/hero.json')
const lunaClock = (lunaHero.info || []).find((i) => i && /clock/i.test(String(i.icon || '')))
check(samePair(pairOf(lunaClock.subtitle), pairOf(lunaContact.hours[0].time)),
  'cafe-luna hero clock matches its hours[]')

console.log(`\ne2e-07 hours-consistency: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)