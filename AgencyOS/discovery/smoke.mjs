import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG } from './catalog.js';
import { DISCOVERY_API_VERSION, DiscoverySystem } from './index.js';
import { DIS_CODES } from './errors.js';
import { normalizePhone, normalizeUrl, normalizeSocial, mergeCandidates, dedupeKey } from './enrich.js';
import { WEAKNESS_RULES, WEAKNESS_DEFS, MENU_CATEGORIES, BOOKING_CATEGORIES } from './weaknesses.js';
import { SimulatedSource, WebsiteSource, GoogleMapsSource, FacebookSource, InstagramSource, DirectorySource, SourceAdapter } from './sources.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = path.join(ROOT, 'storage', 'discovery-smoke');

fs.rmSync(TEST_ROOT, { recursive: true, force: true });

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label, detail = '') {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${label} ${detail}`);
    console.log(`FAIL ${label} ${detail}`);
  }
}

function fakeFetchMap() {
  const map = {};
  for (const b of CATALOG) {
    if (b.website && b.simulatedProbe) {
      map[b.website.replace(/\/+$/, '')] = b.simulatedProbe;
      map[b.website.replace(/^https?:\/\//i, '').replace(/\/+$/, '')] = b.simulatedProbe;
    }
  }
  return map;
}

function makeFakeFetch(map = fakeFetchMap()) {
  return async (url, _opts) => {
    const clean = String(url).replace(/\/+$/, '');
    const entry = map[clean] || map[clean.replace(/^https?:\/\//i, '')];
    if (!entry) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
    return {
      ok: entry.ok,
      status: entry.status,
      headers: { get: (h) => (h === 'x-probe-ms' ? String(entry.timeMs) : null) },
      text: async () => entry.html || ''
    };
  };
}

const newSys = (name, opts = {}) => new DiscoverySystem({
  root: path.join(TEST_ROOT, name),
  fetchImpl: opts.fetchImpl || makeFakeFetch(),
  probeMode: opts.probeMode || 'online',
  validator: true,
  logger: null
});

const byName = (records, name) => records.find((r) => r.name === name);

const main = async () => {
  // ---- API surface ----
  assert(DISCOVERY_API_VERSION === '1.0', 'stable API version 1.0');

  // ---- source registry & interface ----
  const sys = newSys('registry');
  const srcs = sys.sources();
  assert(srcs.length === 6, 'six default sources registered', `got ${srcs.length}`);
  const byId = Object.fromEntries(srcs.map((s) => [s.id, s]));
  assert(byId['simulated'].ready === true, 'simulated source ready');
  assert(byId['website'].ready === true, 'website source ready with fetchImpl');
  for (const id of ['google-maps', 'facebook', 'instagram', 'directory']) {
    assert(byId[id].ready === false, `${id} source not ready without client`);
  }
  for (const id of ['simulated', 'website', 'google-maps', 'facebook', 'instagram', 'directory']) {
    const adapter = sys.source(id);
    for (const method of ['discover', 'normalize', 'validate', 'enrich', 'score']) {
      assert(typeof adapter[method] === 'function', `source ${id} implements ${method}()`);
    }
  }
  assert(!!sys.source('google-maps') && typeof sys.source('google-maps').enrich === 'function', 'provider adapter has full interface');

  // ---- query validation ----
  for (const bad of [{}, null, 42]) {
    let threw = false;
    try { sys.validateQuery(bad); } catch (e) { threw = e.code === DIS_CODES.QUERY_INVALID; }
    assert(threw, 'empty query rejected', JSON.stringify(bad));
  }
  try { await sys.discover({}); assert(false, 'discover with empty query rejected'); } catch (e) { assert(e.code === DIS_CODES.QUERY_INVALID, 'discover with empty query rejected'); }

  // ---- discovery via simulated source ----
  const all = await sys.discover({ area: 'Cairo' });
  assert(all.candidates.length === 8, 'simulated source discovers Cairo businesses', `got ${all.candidates.length}`);
  const restaurants = await sys.discover({ category: 'restaurant' });
  assert(restaurants.candidates.length === 2, 'category filter works', `got ${restaurants.candidates.length}`);
  const termHit = await sys.discover({ term: 'koshary' });
  assert(termHit.candidates.length === 1 && termHit.candidates[0].name.includes('Koshary'), 'term filter works');
  const emptyArea = await sys.discover({ term: 'zzz-none' }).catch(() => null);
  assert(emptyArea === null, 'no candidates -> E_DIS_NO_CANDIDATES');

  // ---- providers ----
  const google = new GoogleMapsSource({ client: async (q) => [{ name: 'Google Place Co', category: 'cafe', area: 'Cairo', phone: '+20 100 000 0001', rating: 4.4, reviews: 50 }] });
  assert(google.ready === true, 'google source ready with client');
  const googleRows = await google.discover({ term: 'cafe' });
  assert(googleRows.length === 1 && googleRows[0].name === 'Google Place Co', 'google client returns candidates');
  const unready = new FacebookSource();
  let unavail = false;
  try { await unready.discover({ term: 'x' }); } catch (e) { unavail = e.code === DIS_CODES.SOURCE_UNAVAILABLE; }
  assert(unavail, 'unconfigured provider throws E_DIS_SOURCE_UNAVAILABLE');
  const providerOnly = new DiscoverySystem({ root: path.join(TEST_ROOT, 'prov'), fetchImpl: makeFakeFetch(), sources: { 'google-maps': () => new GoogleMapsSource() } });
  let allUnavailable = false;
  try { await providerOnly.discover({ term: 'x' }); } catch (e) { allUnavailable = e.code === DIS_CODES.SOURCE_UNAVAILABLE; }
  assert(allUnavailable, 'all-sources-unavailable -> E_DIS_SOURCE_UNAVAILABLE');

  // ---- website source: discover + validate + enrich + probe ----
  const website = new WebsiteSource({ fetchImpl: makeFakeFetch(), probeMode: 'online' });
  const webRows = await website.discover({ term: 'nile' }, { domains: ['https://www.niledentalclinic.com', 'http://www.cairoroastery.com'] });
  assert(webRows.length === 2, 'website source discovers domains', `got ${webRows.length}`);
  const nileRow = webRows.find((r) => r.name.includes('Nile Dental'));
  assert(!!nileRow, 'title extracted from html');
  assert(nileRow.probe && nileRow.probe.ok === true, 'probe attached during website discover');
  assert(nileRow.probe.timeMs === 480, 'x-probe-ms header honored', `got ${nileRow.probe && nileRow.probe.timeMs}`);
  const badValidate = website.validate({ name: '   ' });
  assert(badValidate.valid === false, 'website validate rejects nameless candidate');
  const enriched = await website.enrich({ name: 'No Probe Yet', website: 'https://www.niledentalclinic.com' });
  assert(enriched.probe && enriched.probe.ok === true, 'website enrich probes candidate website');
  const offlineWeb = new WebsiteSource({ fetchImpl: makeFakeFetch(), probeMode: 'offline' });
  const offlineRow = await offlineWeb.enrich({ name: 'X', website: 'https://www.niledentalclinic.com' });
  assert(offlineRow.probe === undefined, 'offline probeMode skips fetch');
  const noDomains = await website.discover({ term: 'x' }, {});
  assert(Array.isArray(noDomains) && noDomains.length === 0, 'website discover without domains yields nothing (probe-only role)');

  // ---- normalization ----
  assert(normalizePhone('+20 10 0123 4567') === '201001234567', 'normalizePhone +20 spaced');
  assert(normalizePhone('022 735 7788') === '20227357788', 'normalizePhone landline 0-prefix');
  assert(normalizePhone('010 333 2211') === '20103332211', 'normalizePhone mobile 0-prefix');
  assert(normalizePhone('00201005558899') === '201005558899', 'normalizePhone 00 international');
  assert(normalizePhone(null) === null, 'normalizePhone null');
  assert(normalizeUrl('www.niledentalclinic.com') === 'https://www.niledentalclinic.com', 'normalizeUrl adds https');
  assert(normalizeUrl('http://www.x.com') === 'http://www.x.com', 'normalizeUrl keeps http');
  assert(normalizeSocial('@koshary') === 'https://koshary', 'normalizeSocial strips @ and prefixes scheme');
  const merged = mergeCandidates([
    { name: 'Dupe Cafe', category: 'cafe', area: 'Cairo', phone: '01012345678', website: null, sources: ['google-maps'] },
    { name: 'Dupe Cafe', category: 'cafe', area: 'Cairo', phone: '+20 101 234 5678', website: 'https://dupecafe.com', whatsapp: '+201011111111', sources: ['facebook'] }
  ]);
  assert(merged.length === 1, 'dedupe merges same-phone candidates', `got ${merged.length}`);
  assert(merged[0].sources.includes('google-maps') && merged[0].sources.includes('facebook'), 'merge unions sources');
  assert(merged[0].website === 'https://dupecafe.com', 'merge fills missing fields');
  assert(merged[0].phone === '201012345678', 'merge normalizes phone');
  assert(dedupeKey({ phone: '201012345678' }) === dedupeKey({ phone: '+20 101 234 5678' }), 'dedupe key is normalized phone');

  // ---- weakness rules ----
  assert(Object.keys(WEAKNESS_RULES).length === 9, 'nine weakness rules', `got ${Object.keys(WEAKNESS_RULES).length}`);
  assert(Object.keys(WEAKNESS_DEFS).length === 9, 'nine weakness definitions');
  assert(MENU_CATEGORIES.includes('restaurant') && BOOKING_CATEGORIES.includes('hotel'), 'category constants exported');

  // ---- full pipeline run (entire market) ----
  const run = await sys.run({ all: true }, { artifact: false });
  assert(run.saved === 14 && run.errors.length === 0, 'run discovers and saves 14 businesses', `saved=${run.saved} errors=${JSON.stringify(run.errors)}`);
  assert(run.metrics.durationMs >= 0, 'execution metrics present');
  assert(run.metrics.probed.attempted === 9, 'nine websites probed', `got ${run.metrics.probed.attempted}`);
  assert(run.metrics.probed.ok === 8 && run.metrics.probed.failed === 1, 'probe results: 8 ok 1 broken', JSON.stringify(run.metrics.probed));
  assert(run.metrics.avgBusiness > 0 && run.metrics.avgOpportunity > 0, 'average scores computed');
  assert(run.metrics.tierCounts.high + run.metrics.tierCounts.medium + run.metrics.tierCounts.low === 14, 'tier counts total 14');
  assert(run.metrics.tierCounts.high === 7 && run.metrics.tierCounts.medium === 5 && run.metrics.tierCounts.low === 2, 'tier split 7/5/2', JSON.stringify(run.metrics.tierCounts));
  assert(run.runId.startsWith('run-'), 'runId generated');
  assert(run.metrics.weaknesses['no-website'] === 5, 'weakness histogram present', JSON.stringify(run.metrics.weaknesses));
  assert(byName(run.businesses, 'Cairo Roastery').probe.timeMs === 4200, 'slow site probe measured via fake fetch');

  // ---- weakness detection per business ----
  const koshary = byName(run.businesses, 'Koshary El Tahrir');
  assert(hasWeakness(koshary, 'no-website') && hasWeakness(koshary, 'no-online-menu') && hasWeakness(koshary, 'no-booking'), 'Koshary: no-website + no-menu + no-booking');
  const roastery = byName(run.businesses, 'Cairo Roastery');
  assert(hasWeakness(roastery, 'slow-website') && hasWeakness(roastery, 'missing-seo') && hasWeakness(roastery, 'outdated-design'), 'Roastery: slow + seo + outdated');
  const bella = byName(run.businesses, 'Bella Pizza');
  assert(hasWeakness(bella, 'broken-website'), 'Bella: broken website', JSON.stringify(bella.probe));
  const aswan = byName(run.businesses, 'Aswan Bakery');
  assert(hasWeakness(aswan, 'no-website') && hasWeakness(aswan, 'no-whatsapp') && !hasWeakness(aswan, 'no-booking'), 'Aswan: no-web + no-wa, bakery excluded from booking');
  const nile = byName(run.businesses, 'Nile Dental Clinic');
  assert(nile.weaknesses.some((w) => w.id === 'poor-branding' || w.id === 'no-booking') && !hasWeakness(nile, 'missing-seo') && !hasWeakness(nile, 'no-website'), 'Nile: seo ok, minor weaknesses only', JSON.stringify(nile.weaknesses));
  const oasis = byName(run.businesses, 'Oasis Garden Cafe');
  assert(oasis.weaknesses.length === 0, 'Oasis: zero weaknesses (control)', JSON.stringify(oasis.weaknesses));
  const zamalek = byName(run.businesses, 'Zamalek Power Gym');
  assert(hasWeakness(zamalek, 'outdated-design') && hasWeakness(zamalek, 'missing-seo') && hasWeakness(zamalek, 'no-whatsapp'), 'Zamalek: outdated + seo + no-wa');
  const falafel = byName(run.businesses, 'Falafel Queen');
  assert(!hasWeakness(falafel, 'no-online-menu') && hasWeakness(falafel, 'no-booking'), 'Falafel: menu found, booking missing');
  const blueWave = byName(run.businesses, 'Blue Wave Beach Hotel');
  assert(hasWeakness(blueWave, 'no-website') && hasWeakness(blueWave, 'no-booking'), 'Blue Wave: no-web + no-booking');

  // ---- scoring ----
  const scores = Object.fromEntries(run.businesses.map((r) => [r.name, r.scores]));
  assert(scores['Nile Dental Clinic'].business.value === 76, 'Nile business score 76', JSON.stringify(scores['Nile Dental Clinic'].business));
  assert(scores['Oasis Garden Cafe'].business.value === 95, 'Oasis business score 95', JSON.stringify(scores['Oasis Garden Cafe'].business));
  assert(scores['Koshary El Tahrir'].business.value === 60, 'Koshary business score 60', JSON.stringify(scores['Koshary El Tahrir'].business));
  assert(scores['Sheikh Hassan Barbershop'].business.value === 28, 'Sheikh business score 28', JSON.stringify(scores['Sheikh Hassan Barbershop'].business));
  assert(scores['Candy Corner Sweets'].salesPriority.tier === 'high' && scores['Candy Corner Sweets'].salesPriority.rank === 1, 'Candy ranked #1 high', JSON.stringify(scores['Candy Corner Sweets'].salesPriority));
  assert(scores['Sheikh Hassan Barbershop'].salesPriority.rank === 2 && scores['Sheikh Hassan Barbershop'].salesPriority.tier === 'high', 'Sheikh ranked #2 high');
  assert(scores['Oasis Garden Cafe'].salesPriority.tier === 'low', 'Oasis low priority');
  assert(scores['Alf Lela Hotel'].salesPriority.tier === 'low', 'Alf Lela low priority');
  assert(scores['Bella Pizza'].salesPriority.tier === 'medium' && scores['Bella Pizza'].salesPriority.rank === 8, 'Bella medium priority (broken site + facebook)', JSON.stringify(scores['Bella Pizza'].salesPriority));
  assert(scores['Silver Moon Diner'].salesPriority.tier === 'medium', 'Silver Moon medium priority', JSON.stringify(scores['Silver Moon Diner'].salesPriority));
  assert(scores['Falafel Queen'].salesPriority.tier === 'medium', 'Falafel medium priority', JSON.stringify(scores['Falafel Queen'].salesPriority));
  assert(scores['Al Nasr Bookstore'].salesPriority.tier === 'medium', 'Al Nasr medium priority');
  assert(scores['Nile Dental Clinic'].salesPriority.tier === 'medium', 'Nile medium priority');
  const ranks = run.businesses.map((r) => r.scores.salesPriority.rank).sort((a, b) => a - b);
  assert(ranks.every((r, i) => r === i + 1), 'ranks are 1..n without gaps', JSON.stringify(ranks));
  const opportunity = run.businesses.map((r) => r.scores.opportunity.value);
  assert(opportunity.every((o) => o >= 0 && o <= 100), 'opportunity clamped 0..100');
  assert(scores['Cairo Roastery'].opportunity.value >= 70, 'Roastery opportunity >= 70 (high)', JSON.stringify(scores['Cairo Roastery'].opportunity));

  // ---- serialization & persistence ----
  assert(sys.list().length === 14, 'index has 14 entries');
  const loadId = koshary.id;
  const loaded = sys.load(loadId);
  assert(loaded.name === 'Koshary El Tahrir' && loaded.scores.business.value === koshary.scores.business.value, 'load(id) roundtrips record');
  const badLoad = (() => { try { sys.load('nope'); return false; } catch (e) { return e.code === DIS_CODES.NOT_FOUND; } })();
  assert(badLoad, 'load unknown id -> E_DIS_NOT_FOUND');
  assert(sys.search('koshary').length === 1, 'search by name');
  assert(sys.search('cairo').length === 8, 'search by area', JSON.stringify(sys.search('cairo').length));
  assert(sys.search(null, { priority: 'high' }).length === 7, 'search by priority high', JSON.stringify(sys.search(null, { priority: 'high' }).map((e) => e.name)));
  assert(sys.search(null, { weakness: 'no-website' }).length === 5, 'search by weakness no-website', JSON.stringify(sys.search(null, { weakness: 'no-website' }).map((e) => e.name)));
  const exportFile = path.join(TEST_ROOT, 'registry', 'export-test.json');
  await sys.export(exportFile);
  const exported = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
  assert(exported.count === 14 && exported.records.length === 14, 'export writes all records');
  assert(!!fs.existsSync(path.join(TEST_ROOT, 'registry', 'storage', 'discovery-engine', 'businesses')), 'business JSON files persisted');

  // ---- run evidence reports ----
  const runsDir = path.join(TEST_ROOT, 'registry', 'storage', 'discovery-engine', 'runs');
  const runDirs = fs.readdirSync(runsDir).filter((d) => d.startsWith('run-'));
  assert(runDirs.length === 1, 'run evidence directory created');
  const runDir = path.join(runsDir, runDirs[0]);
  const summaryJson = JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'));
  assert(summaryJson.report === 'summary' && summaryJson.metrics.durationMs >= 0, 'summary.json with metrics');
  assert(summaryJson.topOpportunities.length === 5, 'top opportunities in summary');
  const exportJson = JSON.parse(fs.readFileSync(path.join(runDir, 'export.json'), 'utf8'));
  assert(exportJson.count === 14, 'run export.json contains 14 records');
  const reportMd = fs.readFileSync(path.join(runDir, 'report.md'), 'utf8');
  assert(reportMd.includes('# Business Discovery Report'), 'markdown report header');
  assert(reportMd.includes('## Execution Metrics'), 'markdown metrics section');
  assert(reportMd.includes('## Priority Ranking'), 'markdown ranking section');
  assert(reportMd.includes('### Business Report') && reportMd.includes('### Opportunity Report') && reportMd.includes('### Weakness Report') && reportMd.includes('### Digital Presence Report'), 'markdown has 4 report sections');
  assert(reportMd.includes('Koshary El Tahrir') && reportMd.includes('Sheikh Hassan Barbershop'), 'markdown lists businesses');
  const runBusinesses = fs.readdirSync(path.join(runDir, 'businesses'));
  assert(runBusinesses.length === 14, 'per-business JSON written to run dir', `got ${runBusinesses.length}`);
  const one = JSON.parse(fs.readFileSync(path.join(runDir, 'businesses', runBusinesses[0]), 'utf8'));
  assert(one.id && one.scores && one.weaknesses && one.collectedAt, 'business JSON has full record shape');

  // ---- structured per-record report ----
  const recordReport = sys.report(nile);
  assert(recordReport.business.score === 76 && recordReport.digitalPresence.website.ok === true, 'record report: business + presence');
  assert(recordReport.weaknesses.count === 2 && Array.isArray(recordReport.weaknesses.items), 'record report: weaknesses');
  assert(recordReport.opportunity.tier === 'medium' && recordReport.opportunity.rank === 12, 'record report: opportunity');

  // ---- stats ----
  const stats = sys.stats();
  assert(stats.persisted === 14 && stats.byPriority.high === 7 && stats.byPriority.medium === 5 && stats.byPriority.low === 2, 'stats persisted + byPriority', JSON.stringify(stats.byPriority));
  assert(stats.weaknesses['no-website'] === 5, 'stats weakness histogram', JSON.stringify(stats.weaknesses));
  assert(stats.runs === 1, 'stats runs counter');

  // ---- artifact hook ----
  let artifactCount = 0;
  const artSys = new DiscoverySystem({
    root: path.join(TEST_ROOT, 'artifacts'),
    fetchImpl: makeFakeFetch(),
    probeMode: 'offline',
    validator: true,
    artifactSystem: { create: () => { artifactCount++; } }
  });
  const artRun = await artSys.run({ category: 'bakery' });
  assert(artRun.saved === 1 && artifactCount === 1, 'artifact hook called per saved record', `saved=${artRun.saved} artifacts=${artifactCount}`);

  // ---- offline probe mode ----
  const offSys = newSys('offline', { probeMode: 'offline' });
  const offRun = await offSys.run({ term: 'roastery' });
  assert(offRun.businesses[0].probe && offRun.businesses[0].probe.timeMs === 4200, 'offline mode uses simulatedProbe');
  assert(hasWeakness(offRun.businesses[0], 'slow-website'), 'offline mode still detects slow website');

  // ---- custom source (extension path) ----
  const custom = new (class extends SourceAdapter {
    constructor() {
      super({ id: 'yelp-like', name: 'Yelp-like Directory' });
    }
    get ready() { return true; }
    async discover(query) {
      if (query.term && query.term === 'nowhere') return [];
      return [{ name: 'Custom Shop', category: 'other', area: 'Cairo', phone: '01098765432', reviews: 30, rating: 4.0 }];
    }
    validate(candidate) {
      if (!candidate.name) return { valid: false, errors: [{ path: 'name', message: 'name required' }] };
      return { valid: true, errors: [] };
    }
  })();
  const extSys = new DiscoverySystem({
    root: path.join(TEST_ROOT, 'ext'),
    fetchImpl: makeFakeFetch(),
    probeMode: 'offline',
    validator: true,
    sources: { simulated: () => new SimulatedSource({ fixtures: [] }), 'yelp-like': () => custom }
  });
  assert(extSys.sources().length === 2, 'custom source registered without touching existing code');
  const extRun = await extSys.run({ term: 'custom' });
  assert(extRun.saved === 1 && extRun.businesses[0].name === 'Custom Shop', 'custom source flows through full pipeline');
  assert(extRun.businesses[0].sources.includes('yelp-like'), 'custom source tagged on record');
  const extInvalid = await extSys.run({ term: 'nowhere' }).catch(() => null);
  assert(extInvalid === null, 'custom source validate() can drop candidates');

  // ---- engine interface defaults ----
  assert(!!WEAKNESS_DEFS['no-website'].label && !!WEAKNESS_DEFS['outdated-design'].label, 'weakness catalog complete');
  assert(sys.priorities().high === 70 && sys.priorities().medium === 50, 'priority thresholds exposed');

  sys.close();
  extSys.close();
  offSys.close();
  artSys.close();

  console.log(`\n=== DISCOVERY SMOKE: ${passed} PASS, ${failed} FAIL ===`);
  if (failures.length) console.log('failures:', failures.join(' | '));
  process.exit(failed ? 1 : 0);
};

function hasWeakness(record, id) {
  return record && record.weaknesses.some((w) => w.id === id);
}

main().catch((e) => {
  console.error('SMOKE CRASH', e);
  process.exit(1);
});
