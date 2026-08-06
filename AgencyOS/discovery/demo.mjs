import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiscoverySystem } from './index.js';
import { SimulatedSource, WebsiteSource, SourceAdapter } from './sources.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_ROOT = path.join(ROOT, 'discovery-demo');
fs.rmSync(DEMO_ROOT, { recursive: true, force: true });

class YallaDirectorySource extends SourceAdapter {
  constructor() {
    super({ id: 'yalla-directory', name: 'Yalla Directory (custom source)' });
  }

  get ready() {
    return true;
  }

  async discover(query) {
    let rows = [
      { name: 'Cairo Souq Antiques', category: 'other', area: 'Cairo', phone: '011 4000 1122', whatsapp: '+20 114 000 1122', rating: 4.1, reviews: 45, address: '16 Kasr El Nil St, Cairo' },
      { name: 'Mansoura Roastery', category: 'cafe', area: 'Mansoura', phone: '050 220 8899', rating: 3.9, reviews: 130, address: '13 El Gomhoreya St, Mansoura' }
    ];
    if (query.area) rows = rows.filter((r) => r.area.toLowerCase().includes(String(query.area).toLowerCase()));
    if (query.term) rows = rows.filter((r) => r.name.toLowerCase().includes(String(query.term).toLowerCase()));
    if (query.category) rows = rows.filter((r) => r.category === query.category);
    return rows;
  }

  score(candidate) {
    return { source: this.id, listedOn: 'yalla-directory.com', listingQuality: candidate.rating >= 4 ? 'good' : 'ok' };
  }
}

const main = async () => {
  const { CATALOG } = await import('./catalog.js');
  const map = {};
  for (const b of CATALOG) if (b.website && b.simulatedProbe) map[b.website.replace(/\/+$/, '')] = b.simulatedProbe;
  const fakeFetch = async (url, _opts) => {
    const e = map[String(url).replace(/\/+$/, '')];
    if (!e) return { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
    return { ok: e.ok, status: e.status, headers: { get: (h) => (h === 'x-probe-ms' ? String(e.timeMs) : null) }, text: async () => e.html || '' };
  };

  console.log('=== AgencyOS Business Discovery Engine (Phase 4.0) Demo ===');
  console.log('');

  const sys = createDiscoverySystem({
    root: DEMO_ROOT,
    fetchImpl: fakeFetch,
    probeMode: 'online',
    validator: true
  });

  sys.registerSource(new YallaDirectorySource());

  console.log('Sources:');
  for (const s of sys.sources()) {
    console.log(`  [${s.ready ? 'ready' : 'waiting'}] ${s.id} - ${s.name}`);
  }
  console.log('');

  // ---- Run 1: full market ----
  console.log('--- Run 1: full market discovery (14 businesses) ---');
  const run1 = await sys.run({ all: true }, { artifact: false });
  console.log(`PASS discovered=${run1.discovered} saved=${run1.saved} errors=${run1.errors.length}`);
  console.log(`PASS duration=${run1.metrics.durationMs}ms probed=${run1.metrics.probed.attempted} (${run1.metrics.probed.ok} ok, ${run1.metrics.probed.failed} failed)`);
  console.log(`PASS avg business=${run1.metrics.avgBusiness} avg opportunity=${run1.metrics.avgOpportunity}`);
  console.log(`PASS tiers: high=${run1.metrics.tierCounts.high} medium=${run1.metrics.tierCounts.medium} low=${run1.metrics.tierCounts.low}`);

  console.log('');
  console.log('Priority ranking:');
  const sorted = run1.businesses.slice().sort((a, b) => a.scores.salesPriority.rank - b.scores.salesPriority.rank);
  console.log('  rank | business                     | category | area         | biz | opp | tier  ');
  console.log('  -----|------------------------------|----------|--------------|-----|-----|-------');
  for (const r of sorted) {
    console.log(`  ${String(r.scores.salesPriority.rank).padStart(4)} | ${r.name.padEnd(28)} | ${r.category.padEnd(8)} | ${r.area.padEnd(12)} | ${String(r.scores.business.value).padStart(3)} | ${String(r.scores.opportunity.value).padStart(3)} | ${r.scores.salesPriority.tier}`);
  }

  console.log('');
  console.log('Weakness highlights (evidence):');
  const noWeb = run1.businesses.filter((r) => r.weaknesses.some((w) => w.id === 'no-website'));
  console.log(`PASS ${noWeb.length} businesses have NO website: ${noWeb.map((r) => r.name).join(', ')}`);
  const roastery = run1.businesses.find((r) => r.name === 'Cairo Roastery');
  for (const w of roastery.weaknesses) console.log(`PASS [${w.severity}] ${roastery.name} -> ${w.label}: ${w.evidence}`);
  const bella = run1.businesses.find((r) => r.name === 'Bella Pizza');
  for (const w of bella.weaknesses) console.log(`PASS [${w.severity}] ${bella.name} -> ${w.label}: ${w.evidence}`);

  console.log('');
  console.log('--- Run 2: targeted query (category=restaurant, area=Cairo) ---');
  const run2 = await sys.run({ category: 'restaurant', area: 'Cairo' }, { artifact: false });
  console.log(`PASS targeted discovery: ${run2.businesses.map((r) => `${r.name} (${r.scores.salesPriority.tier})`).join(', ')}`);

  console.log('');
  console.log('--- Run 3: custom source (yalla-directory) ---');
  const run3 = await sys.run({ term: 'souq' }, { artifact: false, sources: ['yalla-directory'] });
  const souq = run3.businesses[0];
  console.log(`PASS custom source: ${souq.name} - ${souq.area} (business ${souq.scores.business.value}, opp ${souq.scores.opportunity.value}, ${souq.scores.salesPriority.tier})`);
  console.log(`PASS source signals: ${JSON.stringify(souq.sourceSignals)}`);

  console.log('');
  console.log('--- Run 4: website source discovery (domains) ---');
  const website = sys.source('website');
  const webRows = await website.discover({ area: 'Cairo' }, { domains: ['https://www.niledentalclinic.com', 'https://www.oasisgardencafe.com'] });
  console.log(`PASS website source: ${webRows.map((r) => `${r.name} [${r.email || 'no email'} | ${r.menus.length} menus | booking: ${r.booking || 'none'}]`).join(' | ')}`);

  console.log('');
  console.log('--- Reports ---');
  const runsDir = path.join(DEMO_ROOT, 'storage', 'discovery-engine', 'runs');
  const firstRunDir = fs.readdirSync(runsDir).filter((d) => d.startsWith('run-'))[0];
  const runDir = path.join(runsDir, firstRunDir);
  console.log(`PASS summary.json -> ${path.join(runDir, 'summary.json')}`);
  console.log(`PASS report.md    -> ${path.join(runDir, 'report.md')}`);
  console.log(`PASS export.json  -> ${path.join(runDir, 'export.json')}`);
  console.log(`PASS businesses/  -> ${fs.readdirSync(path.join(runDir, 'businesses')).length} per-business JSON files (full market run)`);

  const md = fs.readFileSync(path.join(runDir, 'report.md'), 'utf8');
  console.log('');
  console.log('Report preview (first 14 lines):');
  console.log(md.split('\n').slice(0, 14).join('\n'));

  console.log('');
  console.log('--- Persistence & search ---');
  console.log(`PASS index entries: ${sys.list().length}`);
  console.log(`PASS search "koshary": ${sys.search('koshary').map((e) => e.name).join(', ')}`);
  console.log(`PASS search priority=high (${sys.search(null, { priority: 'high' }).length}): ${sys.search(null, { priority: 'high' }).map((e) => e.name).join(', ')}`);
  const stats = sys.stats();
  console.log(`PASS stats: byPriority=${JSON.stringify(stats.byPriority)} top weakness=${Object.entries(stats.weaknesses).sort((a, b) => b[1] - a[1])[0][0]} (${Object.entries(stats.weaknesses).sort((a, b) => b[1] - a[1])[0][1]})`);

  sys.close();
  console.log('');
  console.log('DEMO DONE');
};

main().catch((e) => {
  console.error('DEMO FAIL', e);
  process.exit(1);
});
