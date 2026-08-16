import { DossierEngine, DOSSIER_EVENTS } from '../index.js';
import { DOS_CODES } from '../errors.js';

// Shift-left secret scan (Production Readiness hardening, P1-1): the dossier
// boundary rejects secret-like content with DOS008 and emits the registered
// event. Deterministic, bus-only, no credentials, no network.

let passed = 0;
let failed = 0;
function assert(cond, label, extra = '') {
  if (cond) {
    passed++;
    console.log(`PASS ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${label} ${extra}`);
  }
}
function section(label) {
  console.log(`== ${label}`);
}

function recordOf(overrides = {}) {
  return {
    id: 'dis-cairo-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
    phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
    instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
    address: '12 Tahrir St', photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
    rating: 4.2, reviews: 230, website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
    sources: ['simulated', 'website'], weaknesses: [{ id: 'no-booking', severity: 'minor' }],
    scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } },
    ...overrides
  };
}

function makeBus() {
  const events = [];
  return {
    events,
    emitEvent(event, meta, detail) {
      events.push({ event, meta, detail });
    }
  };
}

section('dossier shift-left secret scan');
{
  const bus = makeBus();
  const engine = new DossierEngine({ root: null, bus });

  const clean = await engine.build(recordOf(), { persist: false });
  assert(clean.validation.valid === true, 'clean generated dossier passes');
  assert(Object.keys(clean.documents).length === 20, '20 documents generated');
  assert(!bus.events.some((e) => e.event === DOSSIER_EVENTS.SECRET_SCAN_FAILED), 'clean build emits no secret-scan event');

  let threw = null;
  try {
    await engine.build(recordOf({ name: 'Cairo Roastery token=superSecretValue123' }), { persist: false });
  } catch (err) {
    threw = err;
  }
  assert(threw !== null, 'secret-like content rejected');
  assert(threw && threw.code === DOS_CODES.SECRET_SCAN_FAILED, 'rejection uses DOS008', threw && threw.code);
  assert(threw && threw.message.includes('secret scan'), 'rejection message identifies the scan');
  const denied = bus.events.filter((e) => e.event === DOSSIER_EVENTS.SECRET_SCAN_FAILED);
  assert(denied.length === 1, 'dossier.secret_scan_failed event emitted once');
  assert(denied[0] && denied[0].meta && denied[0].meta.module === 'dossier', 'event meta.module wired');
  assert(denied[0] && denied[0].meta && denied[0].meta.businessId === 'dis-cairo-001', 'event meta.businessId wired');
  assert(denied[0] && denied[0].detail && denied[0].detail.matches.length >= 1, 'event carries match detail', JSON.stringify(denied[0] && denied[0].detail));

  let threw2 = null;
  try {
    await engine.build(recordOf({ name: 'Cairo Roastery secret=anotherSuperSecretValue' }), { persist: false });
  } catch (err) {
    threw2 = err;
  }
  assert(threw2 && threw2.code === DOS_CODES.SECRET_SCAN_FAILED, 'second secret form rejected with DOS008', threw2 && threw2.code);
  assert(bus.events.filter((e) => e.event === DOSSIER_EVENTS.SECRET_SCAN_FAILED).length === 2, 'second rejection emits again');
}

console.log(`\ndossier/tests/secret-scan.mjs: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;