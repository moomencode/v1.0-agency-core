import { Brain } from './brain/index.js';
import { createExecutor } from './runtime/executor.js';

const MARKETS = [
  {
    id: 'dis-cairo-001', name: 'Cairo Roastery', category: 'cafe', area: 'Cairo',
    phone: '2027357788', email: 'hi@roastery.com', whatsapp: '201000000001',
    instagram: 'https://instagram.com/roastery', facebook: 'https://facebook.com/roastery',
    address: '12 Tahrir St', photos: ['a', 'b', 'c'], menus: [{}, {}], booking: '/reservation',
    rating: 4.2, reviews: 230,
    website: 'https://roastery.example', probe: { ok: true, timeMs: 400 },
    sources: ['simulated', 'website'],
    weaknesses: [{ id: 'no-booking', severity: 'minor' }],
    scores: { business: { value: 69, breakdown: { presence: 20 } }, opportunity: { value: 77 } }
  },
  {
    id: 'dis-cairo-002', name: 'Zamalek Gym', category: 'gym', area: 'Cairo',
    phone: '2027601122', email: 'info@zamalekgym.com', whatsapp: '201000000002',
    address: '5 Sharia 26 July', photos: ['a'], menus: [], rating: 4.5, reviews: 410,
    website: 'https://zamalekgym.example', probe: { ok: true, timeMs: 900 },
    sources: ['simulated', 'website'],
    weaknesses: [],
    scores: { business: { value: 78, breakdown: { presence: 24 } }, opportunity: { value: 84 } }
  },
  {
    id: 'dis-giza-003', name: 'Giza Tailor', category: 'tailor', area: 'Giza',
    phone: null, email: null, whatsapp: null, address: '10 Mariouteya', rating: 3.1, reviews: 12,
    website: 'https://gizatailor.example', probe: { ok: false, status: 500, timeMs: 3100 },
    sources: ['simulated'],
    weaknesses: [{ id: 'no-contact', severity: 'major' }, { id: 'broken-site', severity: 'major' }],
    scores: { business: { value: 41, breakdown: { presence: 12 } }, opportunity: { value: 48 } }
  },
  {
    id: 'dis-maadi-004', name: 'Maadi Bakery', category: 'bakery', area: 'Cairo',
    phone: '2027354433', email: 'bakery@maadi.example', whatsapp: '201000000004',
    address: '3 Road 9', rating: 4.0, reviews: 88, menus: [{}, {}, {}],
    website: 'https://maadibakery.example', probe: { ok: true, timeMs: 500 },
    sources: ['simulated', 'website'],
    weaknesses: [{ id: 'no-online-menu', severity: 'minor' }],
    scores: { business: { value: 52, breakdown: { presence: 15 } }, opportunity: { value: 55 } }
  },
  {
    id: 'dis-heliopolis-005', name: 'Heliopolis Barber', category: 'barber', area: 'Cairo',
    phone: '2022633', email: null, whatsapp: '201000000005',
    address: '90 El Thawra St', rating: 3.6, reviews: 21, photos: [],
    website: null, probe: null,
    sources: ['simulated'],
    weaknesses: [{ id: 'no-website', severity: 'major' }],
    scores: { business: { value: 35, breakdown: { presence: 8 } }, opportunity: { value: 33 } }
  },
  {
    id: 'dis-ghost-006', name: 'Unknown Shop', category: 'other', area: 'Cairo',
    rating: null, reviews: 0, phone: null, email: null, sources: [],
    weaknesses: [],
    scores: { business: { value: 0 }, opportunity: { value: 0 } }
  }
];

const executor = await createExecutor({ runId: 'brain-demo' });
const brain = new Brain({ executor });

console.log('AGENCY BRAIN DEMO — Phase 4.0.5');
console.log('='.repeat(72));
console.log('Engines: context + policies + decision + reasoning + strategy + planner + state-machine + execution-plans + metrics');
console.log('Runtime wiring: EventBus + Validator + WorkflowRunner via createExecutor()');
console.log('='.repeat(72));

const rows = [];
for (const record of MARKETS) {
  const r = await brain.runBusiness(record);
  rows.push(r);
  const s = brain.summarize(r);
  console.log(`\n${s.businessId} — ${record.name}`);
  console.log(`  verdict: ${s.verdict} (confidence ${s.confidence}, risk ${s.risk})`);
  console.log(`  strategy: ${s.strategy} (score ${s.strategyScore}) | plan: ${s.planOk === null ? 'not-run' : s.planOk ? 'completed' : 'blocked'} | state: ${s.finalState}`);
  console.log(`  estimates: value $${r.decision.estimates.websiteValue}, cost $${r.decision.estimates.devCost}, sales $${r.decision.estimates.salesValue}, ROI ${r.decision.estimates.roi}, closing ${r.decision.estimates.closingProbability}`);
  console.log(`  priority: opp ${r.decision.priority.opportunity.tier} (${r.decision.priority.opportunity.value}), execution ${r.decision.priority.execution.tier}`);
  console.log(`  headline: ${s.headline}`);
  if (r.plan) {
    const gated = r.plan.results.filter((x) => x.ok === false);
    if (gated.length) console.log(`  blocked at: ${gated[0].stepId} (${gated[0].error})`);
  }
}

console.log('\n' + '='.repeat(72));
console.log('TRACE SAMPLE — ' + rows[0].businessId + ' (' + rows[0].decision.verdict + ')');
console.log('='.repeat(72));
for (const step of rows[0].trace.chain) {
  console.log(`  [${step.step}] ${step.label} — ${step.contribution}`);
}
console.log('  rationale:', rows[0].trace.rationale);

console.log('\n' + '='.repeat(72));
console.log('DECISION MATRIX');
console.log('='.repeat(72));
for (const r of rows) {
  const s = brain.summarize(r);
  const state = s.planOk === null ? '-' : s.planOk ? 'DONE' : 'BLOCKED';
  console.log(`  ${s.businessId.padEnd(16)} ${s.verdict.padEnd(8)} ${s.strategy.padEnd(8)} risk ${s.risk.padEnd(6)} ${s.finalState.padEnd(9)} plan ${state.padEnd(7)} revenue $${s.estimatedRevenue}`);
}

console.log('\n' + '='.repeat(72));
console.log('METRICS SNAPSHOT');
console.log('='.repeat(72));
const snap = brain.snapshot();
console.log(`  discovered: ${snap.businesses.discovered} | approved: ${snap.businesses.approved} | websites: ${snap.businesses.websitesGenerated}`);
console.log(`  avg opportunity: ${snap.performance.avgOpportunityScore} | estimated revenue: $${snap.performance.estimatedRevenue} | avg build: ${Math.round(snap.performance.avgBuildTimeMs / 1000)}s`);
console.log(`  success rate: ${snap.reliability.successRate}% | failures: ${snap.reliability.failureRate}% | retries: ${snap.reliability.retryCount} | escalations: ${snap.reliability.escalations}`);

const wf = await brain.executeWorkflow('onboarding.workflow', {});
console.log(`\n  workflow integration: ${wf.status === 'unavailable' ? 'unregistered workflow -> status ' + wf.status : 'ran ' + wf.status} (runtime WorkflowRunner wired)`);

await executor.close?.();
console.log('\nDEMO COMPLETE');
