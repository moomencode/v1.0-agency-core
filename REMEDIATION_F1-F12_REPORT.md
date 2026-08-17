# F1–F12 Remediation Report — Production Data Fidelity

**Repository:** `D:/demo wepsite/Garcia2` (AgencyOS)
**Status:** ALL GREEN — 12/12 findings remediated, 0 known fabrication classes remain, full regression at zero failures.
**Scope:** SOURCE → DISCOVERY → DOSSIER → PIPELINE → GENERATION (configs/sections/hero/reviews/offers/features/faq/menu) → QA → DELIVERY.

---

## 1. Status Overview

| Finding | Title | Status | Primary fix |
|---|---|---|---|
| F1 | Whatsapp explicit-signal only | GREEN | `discovery/enrich.js`, `dossier/builders/index.js` |
| F2 | Hours verified-only, no fallback fabrication | GREEN | `dossier/builders/index.js` |
| F3 | html `lang`/`dir`, og:locale per business | GREEN | `website-engine/renderer/index.js`, `website-engine/export/html.js` |
| F4 | Canonical from real website only; addressShort deduped | GREEN | `pipeline/qa.js`, `pipeline/schemas/index.js`, `delivery/qa/seo.js` |
| F5 | Gallery count / og:image truthful | GREEN | `pipeline/config/index.js`, `website-engine/validators/index.js` |
| F6 | Social platforms enumerated (no omissions) | GREEN | `discovery/enrich.js`, `pipeline/manifest.js` |
| F7 | Booking only from explicit/verified signal | GREEN | `dossier/builders/index.js` |
| F9 | No landline fallback into whatsapp | GREEN | `dossier/normalizers/index.js` |
| F10 | No literal `{placeholder}` leaks | GREEN | `pipeline/config/index.js`, fidelity scan every generated config |
| F11 | Fabricated stats/offers/reviews/faq/menu/features/services removed | GREEN | `pipeline/profiles/index.js`, `pipeline/normalize.js`, `pipeline/sections.js`, `pipeline/config/index.js` |
| F12 | QA reports truthful (`ok ⟺ errors.length === 0`) | GREEN | `delivery/qa/html.js`, NEW `delivery/qa/fidelity.js` |
| SEC-01 | Hostile businessId containment | GREEN | `runtime/utils.js`, `dossier/engine.js`, `discovery/enrich.js` |
| C1 | Gym profile reservation-anchor inconsistency (caught by pilots) | GREEN | `pipeline/profiles/index.js` |

---

## 2. Verification Pilots (full chain, fresh evidence)

5 synthetic businesses ran the complete chain (discovery → qualification → brain → dossier → pipeline → render → **QA gates** → delivery approval → local deploy) with L4 autonomy, local provider, zero network, approvals enforced. All 5 **DEPLOYED**.

| Pilot | Category | Status | stats ids | reviews | faq | offers | features | gallery | booking | hero clock | placeholder leaks |
|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-rest-001 El Maza Grill | restaurant | DEPLOYED | rating,reviews | 0 | 0 | 2 | 3 | 4 | true | Open Hours | 0 |
| synthetic-cafe-002 Corner Brew Cafe | cafe | DEPLOYED | rating,reviews | 0 | 0 | 2 | 3 | 5 | true | Open Hours | 0 |
| synthetic-barber-003 Sharp Fades | barber | DEPLOYED | rating,reviews | 0 | 0 | 2 | 3 | 3 | true | Open Hours | 0 |
| synthetic-gym-004 Ironline Fitness | gym | DEPLOYED | rating,reviews | 0 | 0 | 2 | 3 | 4 | true | Open Hours | 0 |
| synthetic-dental-005 Pearl Dental | clinic | DEPLOYED | rating,reviews,doctors,specialties | 0 | 0 | 2 | 3 | 6 | true | Open Hours | 0 |

Every deployed business delivered a truthful QA report: `ok ⟺ errors.length === 0` for all 36 checks across 7 groups (engine, seo, a11y, links, assets, secrets, **fidelity**), 0 failures, fidelity placeholder gates present on every page.

**All findings verified PASS on fresh pilots**: F1, F2, F3, F4, F5, F6, F7, F9, F10, F11, F12, SEC-01, B1–B21.
Evidence: `AgencyOS/storage/verification-pilots/2026-08-17T02-15-02/` (`findings.json`, `before.json`, `after.json`, `campaign-results.json`, `businesses/*` dossier-derived evidence + regenerated configs, `qa/*` per-business QA reports, `delivery/*`).

Two pilot iterations earned their keep:
- **Gym first-run FAILED `PIP_QA_FAILED` → QA "website-validation"** — the gym profile referenced `#reservation` (CTA + service links) but did not declare the reservation section; as soon as F7 enabled booking from the verified URL, the section/booking consistency check fired. Fixed by adding the data-gated `reservation` section to the gym profile (C1). The pilot existed precisely to catch this latent defect.
- Evidence collector initially mis-derived (execution outputs vs `links`), photo-count and menu-dish shapes — corrected to read the stored artifacts (campaign store, dossier v1 docs, delivery QA reports, deterministic regeneration of configs from the identical stored dossier).

---

## 3–14. Finding-by-finding

### F1 — WhatsApp explicit-signal only
- **BEFORE:** contact builder could fall back from an explicit WhatsApp number to a phone number (landline) when WhatsApp wasn't present.
- **FIX:** `whatsapp` is set **only** from an explicit verified WhatsApp value on the enriched record; phone stays as plain `phones`; no cross-fallback in either direction.
- **TESTS:** `pipeline/tests/fidelity.mjs` ("whatsapp is explicit-signal only"): contact.json whatsapp = the real number, landline stays plain phone in `phone`, wa.me link in social.json. Pilot F1/F9 PASS (published number == synthetic explicit number).
- **EVIDENCE:** `AgencyOS/storage/verification-pilots/2026-08-17T02-15-02/findings.json` (F1 PASS, F9 PASS).

### F2 — Hours only from verified data
- **BEFORE:** when hours were unverified (or never returned), the system published fixed fallback hours ("10:00 AM - 10:00 PM") — indistinguishable from real hours.
- **FIX:** hours doc built exclusively from verified `openingHours`; when absent the business is marked no-hours and the hours clock entry is dropped; hero clock now uses the neutral `Open Hours` label with the verified range substituted into `{hours}`.
- **TESTS:** fidelity "hours verified, no fallback fabrication" asserts hours/hoursShort from the record and absence of the fabricated string. Pilot F2 PASS (clock = verified synthetic hours, no "Open Daily").
- **EVIDENCE:** `after.json` heroClock + contactHours per business.

### F3 — html `lang`/`dir`, og:locale per business
- **BEFORE:** rendered HTML always `lang="en"`/`dir="ltr"`; og:locale hard-coded `en_US`.
- **FIX:** `renderDocument` emits locale-aware `dir`, `lang` on the `<html>` tag; export html.js maps business locale → og:locale (verified by `website-engine` export regression suite; default remains `en`/`en_US`/`ltr`).
- **TESTS:** `AgencyOS/website-engine/tests/regression.mjs` (export-level assertions).

### F4 — Canonical and addressShort truthfulness
- **BEFORE:** canonical fabricated as `https://{slug}.example.com`; `addressShort` duplicated the area text.
- **FIX:** canonical emitted only from a real `website.url` (else `null`), optional-canonical allowed through QA, schema and delivery SEO validation; addressShort no longer repeats area.
- **TESTS:** pipeline fidelity + delivery QA canonical gate; pilot F4 PASS (canonical null on all 5 — no website field — while QA remains green).

### F5 — Gallery and og:image truthfulness
- **BEFORE:** `galleryCount` padded to a minimum of 4 entries; og:image claimed even with an empty gallery.
- **FIX:** gallery count == real photo count (up to 8); og:image emitted only when the gallery is non-empty (else `null`); validators accept either.
- **TESTS:** fidelity "gallery + og:image truthful vs real photo counts" (count 3, og:image real asset; empty photos → 0 entries + og:image null). Pilot F5 PASS (gallery == photo count per business, og:image present only when gallery > 0).

### F6 — Social platforms enumerated
- **BEFORE:** verified platforms could be omitted from `social.json`.
- **FIX:** every verified platform on the record is carried into social config; manifest/icon wiring consistent.
- **TESTS:** fidelity "all verified platforms enumerated" (tiktok/linkedin/youtube/instagram); discovery fidelity suite (`AgencyOS/discovery/tests/fidelity.mjs`) covers enrichment coverage on real fixtures.

### F7 — Booking only from explicit/verified signal
- **BEFORE:** booking could be enabled from implicit presence (menu/files/site existence) alone.
- **FIX:** `hasBooking` requires a verified explicit booking URL; reservation section + booking.json enabled strictly from it; booking copy stays generic.
- **TESTS:** fidelity "booking enabled only from explicit signal" (no signal → disabled; verified URL → enabled). Pilots: all 5 verified booking URLs → booking enabled + reservation section on.
- **C1 (new):** gym profile's `#reservation` CTA/service anchors had no reservation section — surfaces only with F7 behavior; fixed + pinned by fidelity test "gym profile reservation section data-gated (C1)".

### F9 — No landline fallback into whatsapp
- See F1. `+20 2` landlines (11 digits) remain plain phone only, un-prettified.

### F10 — Placeholder leak scan (every generated config)
- **BEFORE:** literal tokens like `{rating}`, `{hours}` could reach generated configs.
- **FIX:** config generators substitute all handled tokens; scan verifies **every** generated config (19 files) for `/\{[a-z][a-z0-9-]*\}/g` → deepStrictEqual `[]` in pipeline fidelity, plus per-page placeholder gate in the new delivery fidelity QA group.
- **TESTS:** fidelity "no literal {placeholder} in any generated config" + `delivery/tests/fidelity.mjs` `{rating}` leak case; pilot runs: 0 leaks on all 5 businesses × 19 configs.

### F11 — Fabricated content classes removed (stats/offers/reviews/faq/menu/features/services)
- **BEFORE (documented classes):**
  - B1 gallery padded to 4 minimum (→ F5) · B2 offers from profile pools (→F11) · B3 category stats "cups/loaves/patients" fabricated (→F11) · B4 named testimonials from random name pools (→F11) · B5 faq claims from profile pools (→F11) · B6 hero "Open Daily" fixed hours (→F11) · B7 canonical `https://{slug}.example.com` (→F4) · B8 menu prices `60+15i` and count default 4 (→F11) · B9 "50+" reviews fallback (→F10) · B10 og:image without gallery (→F5) · B11 features generic claims (→F11) · B12 services from profile when no real services (→F11) · B17 fallback hours (→F2) · B19 addressShort dup (→F4) · B21 placeholder leaks (→F10).
- **FIX:**
  - `pipeline/profiles/index.js`: all 11 profile blocks swept — `stats: []`, `offers: []`, `faq: []`; hero entries reduced to data-templated map/clock (no fabricated icons/claims); menu templates emptied where no verified menu doc.
  - `pipeline/normalize.js`: `hasVerifiedStats`, `hasOffers`, `hasFeatures`; **hasMenus strictly products-based** (the "absence of no-online-menu weakness" clause that pinned it true was removed); `reviewTexts` added (non-empty text only).
  - `pipeline/sections.js`: services/stats/offers/features/testimonials data-gated; **faq always disabled** ('no verified faq data').
  - `pipeline/config/index.js`: seeded RNG, review-name/role pools removed; reviews from `reviewTexts` only; offers from opportunities only; features from strengths only; services from services only; menu prices from real product prices (`null` when unknown), real category counts; faq.json always empty items; hero `{hours}` from verified `hoursShort`.
- **TESTS:** `pipeline/unit.mjs` (24/0) truth-block updates; fidelity F11 block (faq/testimonials/offers/features off without data; verbatim texts when present; verified-only stat ids); pilot F11 PASS — every published offer/feature title exists verbatim in the dossier docs (brain-derived strengths/opportunities are evidence-labeled analytics, counted 1:1), menu never invents dishes/prices, reviews and faq empty, stats ⊆ {rating,reviews,doctors,specialties,facilities}.

### F12 — QA reports truthful
- **BEFORE:** `delivery/qa/html.js` `check()` attached errors even when passing → `{ ok: true, errors: ["missing <title>"] }` in QA reports (pinned artifact: client-005 pilot `storage/delivery/qa/829cdd43730de494/qa-report.json`).
- **FIX:** `check()` returns `errors: []` on pass — one shared helper covers all groups; invariant `ok ⟺ errors.length === 0` now holds for every check.
- **NEW DELIVERY FIDELITY QA GROUP (7th):** per-page scan of generated HTML (scripts/styles stripped) for `{placeholder}` tokens → `fidelity:placeholder:<page>` checks inside `FinalQA`.
- **TESTS:** `delivery/tests/fidelity.mjs` (4/4): truthful reports, tamper detection, placeholder gate, same-artifact build→deliver→tamper→re-verify loop. Pilot F12 PASS — all 5 deployed QA reports truthful, 0 failures, fidelity group present.

### SEC-01 — Hostile businessId containment
- `runtime/utils.js` `resolveBusinessId(id,{prefix})` shared across discovery/dossier/orchestrator; discovery spread-order fix so the resolved id wins; dossier replaces hostile ids in value **and** storage root; integration suite blocks traversal.

### C1 — Gym profile reservation anchors (caught during pilots)
- See F7. Fix: gym profile `sections` gains data-gated `reservation`; pinned in pipeline fidelity (9th test). First pilot run for the synthetic gym failed `PIP_QA_FAILED` exactly here — the failure existed unseen until F7 made verified booking light up the gym template.

---

## 15. Regression Results

| Stage | PASS | FAIL | Suites | Notes |
|---|---|---|---|---|
| Baseline (start of remediation) | 1785 | 1 (flaky `failure-isolation`) | 79 | v1.8.2-production-readiness |
| After Phase A | 1798 | 0 | 81 | SEC-01 + infrastructure |
| After Phase B+C (F1–F12) | 1804 | 0 | 82 | one transient `failure-isolation` flake under full-run load, stable standalone 3× |
| **Final (post C1 + pilot tooling)** | **1805** | **0** | **82** | includes new C1 fidelity case |

Key suites: pipeline unit 24/0 · pipeline fidelity 9/0 · pipeline smoke 9 · secret-scan 6 · delivery fidelity 4/0 · delivery qa 17 · delivery security 13 · delivery smoke 16 · orchestrator security 13 · idempotency 6 · failure-isolation 3 · website-engine visual 2 (byte-for-byte snapshot stable).

---

## 16. Deliverables (new files)

| Path | Purpose |
|---|---|
| `AgencyOS/scripts/verify-pilots.mjs` | Fresh 5-business full-chain verification runner (synthetic, labeled; OUT `storage/verification-pilots/<runId>/`) |
| `AgencyOS/delivery/qa/fidelity.js` | 7th delivery QA group: per-page placeholder gate |
| `AgencyOS/delivery/tests/fidelity.mjs` | 4 tests incl. same-artifact tamper loop |
| `AgencyOS/pipeline/tests/fidelity.mjs` | F1/F2/F5/F6/F7/F9/F10/F11 + C1 (9 tests) |
| `AgencyOS/discovery/tests/fidelity.mjs` | enrichment coverage suite |

Modified essence: `pipeline/profiles/index.js`, `pipeline/normalize.js`, `pipeline/sections.js`, `pipeline/config/index.js`, `delivery/qa/html.js`, `delivery/qa/index.js`, `delivery/qa/seo.js`, `runtime/utils.js`, `discovery/enrich.js`, `dossier/{engine,builders,extractors,normalizers}` , `website-engine/{renderer,export/html,validators}`, `pipeline/{qa,schemas,manifest,smoke,unit}` + test suites.

## 17. Evidence Inventory

- Pilots (final): `AgencyOS/storage/verification-pilots/2026-08-17T02-15-02/` (+ earlier iterations `…02-04-08`, `…02-11-27`, `…02-12-35`)
- F12 before-artifact (preserved, untouched): `D:\demo wepsite\storage\orchestrator-tests\client-005-pilot\` (incl. `storage/delivery/qa/829cdd43730de494/qa-report.json`)
- `05-client/` — reference-only C5 evidence, **untouched** (its `run-pilot.mjs` ROOT misresolution documented; the fresh runner lives in-repo with correct resolution)
- Regression log: `%TEMP%\opencode\regress-f12b.log` (1804/0) — final run 1805/0 (82 suites)

## 18. Git Hygiene

- **HEAD:** `5035bce feat(production): complete production readiness hardening` (tag: `v1.8.2-production-readiness`)
- **Working tree:** 23 modified tracked files; new untracked source/test entries: `delivery/qa/fidelity.js`, `delivery/tests/fidelity.mjs`, `discovery/tests/`, `pipeline/tests/fidelity.mjs`, `scripts/verify-pilots.mjs`, this report (+ evidence storage under `storage/verification-pilots/` and the `05-client/` reference dir)
- `git diff --stat`: 335 insertions(+), 306 deletions(-) across 23 files
- `git diff --check`: clean (LF→CRLF advisories only, zero whitespace errors)

## 19. Final Status

- 12/12 findings GREEN; B1–B21 fabrication classes absent from fresh builds; QA invariant holds end-to-end; **full regression 1805 passed / 0 failed across 82 suites**; 5/5 verification pilots deployed with truthful QA.
- Nothing committed, tagged, or pushed beyond the pre-existing `v1.8.2-production-readiness` — working tree left as-is for review.
- Suggested next steps (out of scope): treat brain-derived strengths/opportunities as curated recommendations with explicit provenance display; consider persisting pipeline configs per build in production stacks; make the artifact-engine payload serialization (currently `[object Object]` wrappers) a follow-up hardening item.