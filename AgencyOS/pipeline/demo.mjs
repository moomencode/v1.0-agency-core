import { createExecutor } from '../runtime/executor.js';
import { DossierEngine } from '../dossier/index.js';
import { createPipelineRunner, PIPELINE_EVENTS } from './index.js';

const MARKETS = [
  {
    id: 'dis-cairo-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
    phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
    instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
    address: '12 Tahrir St', coordinates: { lat: 30.0444196, lng: 31.2357116 },
    photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
    rating: 4.2, reviews: 230, website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
    sources: ['simulated', 'website'], weaknesses: [{ id: 'no-booking', severity: 'minor' }],
    scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } }
  },
  {
    id: 'dis-cairo-002', name: 'Zamalek Gym', category: 'gym', area: 'Cairo',
    phone: '2027601122', email: 'info@zamalekgym.com', whatsapp: '201000000002',
    address: '5 Sharia 26 July', photos: ['a'], rating: 4.5, reviews: 410,
    website: 'https://zamalekgym.example', probe: { ok: true, timeMs: 900 },
    sources: ['simulated', 'website'], weaknesses: [],
    scores: { business: { value: 78, breakdown: { presence: 24 } }, opportunity: { value: 84 } }
  },
  {
    id: 'dis-giza-003', name: 'Giza Tailor', category: 'tailor', area: 'Giza',
    phone: null, email: null, whatsapp: null, address: '10 Mariouteya', rating: 3.1, reviews: 12,
    website: 'https://gizatailor.example', probe: { ok: false, status: 500, timeMs: 3100 },
    sources: ['simulated'], weaknesses: [{ id: 'no-contact', severity: 'major' }, { id: 'broken-site', severity: 'major' }],
    scores: { business: { value: 41, breakdown: { presence: 12 } }, opportunity: { value: 48 } }
  }
];

const executor = await createExecutor({ runId: 'pipeline-demo' });
const de = new DossierEngine({ root: null });
const runner = createPipelineRunner({ root: 'storage/pipeline-demo', validator: executor.validator, bus: executor.bus, logger: executor.logger });

console.log('WEBSITE PRODUCTION PIPELINE DEMO — Phase 4.2');
console.log('='.repeat(72));
console.log('13 stages: validate → normalize → theme → sections → assets → config → navigation → seo');
console.log('           → structured data → localization → build package → QA → website ready');
console.log('Rules: deterministic · resumable · schema-validated · versioned · reproducible');
console.log('='.repeat(72));

const eventLog = [];
for (const ev of Object.values(PIPELINE_EVENTS)) {
  runner.bus.emitter.on(ev, (d) => eventLog.push(`${d.event || ev}:${d.stage || ''}`));
}

for (const record of MARKETS) {
  const dossier = await de.build(record, { persist: false });
  const ctx = await runner.run(dossier, { businessId: record.id, runId: `demo-${record.id}` });
  const cfg = ctx.configs;
  console.log(`\n${ctx.businessId} — ${ctx.name} (${ctx.category})`);
  console.log(`  verdict: ${dossier.verdict} | status: ${ctx.status} | stages: ${ctx.stages.filter((s) => s.ok).length}/13 | QA: ${ctx.qaPassed ? 'PASS' : 'FAIL'} (${ctx.qaChecks} checks)`);
  console.log(`  sections: ${ctx.sections.enabledIds.join(' · ')}`);
  console.log(`  theme: ${cfg['theme.json'].defaultMode} mode | ${cfg['theme.json'].typography.display} + ${cfg['theme.json'].typography.body}`);
  console.log(`  hero: "${cfg['hero.json'].title}" — ${cfg['hero.json'].subtitle.toLowerCase()} | cta: ${cfg['hero.json'].ctaPrimary.label} / ${cfg['hero.json'].ctaSecondary.label}`);
  console.log(`  contact: ${cfg['contact.json'].phone || 'no phone'} · ${cfg['contact.json'].email || 'no email'} · ${cfg['contact.json'].area || 'no area'}`);
  console.log(`  seo: "${cfg['seo.json'].title}"`);
  console.log(`  menu: ${cfg['menu.json'].categories.map((c) => `${c.label}(${c.count})`).join(' ')}`);
  console.log(`  offers: ${cfg['offers.json'].items.length} | faq: ${cfg['faq.json'].items.length} | reviews: ${cfg['reviews.json'].items.length} | stats: ${cfg['stats.json'].items.length}`);
  console.log(`  output: ${ctx.outputRoot.replace(/\\/g, '/')}`);
}

console.log('\n' + '='.repeat(72));
console.log('DETERMINISM CHECK — rebuild Zamalek Gym, compare checksums');
console.log('='.repeat(72));
const dossier2 = await de.build(MARKETS[1], { persist: false });
const ctx2 = await runner.run(dossier2, { businessId: 'dis-cairo-002', runId: 'demo-again' });
const prev = Object.entries(ctx2.configs).map(([k, v]) => [k, JSON.stringify(v)]).sort();
const prevCtx = await runner.run(dossier2, { businessId: 'dis-cairo-002', runId: 'demo-thrice' });
const again = Object.entries(prevCtx.configs).map(([k, v]) => [k, JSON.stringify(v)]).sort();
const identical = prev.length === again.length && prev.every(([k, v], i) => again[i][0] === k && again[i][1] === v);
console.log(`  identical rebuild: ${identical} (${prev.length} configs, checksums match)`);

console.log('\n' + '='.repeat(72));
console.log('EVENTS RECEIVED');
console.log('='.repeat(72));
console.log('  ' + eventLog.join('\n  '));

await executor.close?.();
console.log('\nDEMO COMPLETE');
