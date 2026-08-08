import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem } from './helpers.mjs';
import { buildRecord } from '../../discovery/enrich.js';

const STRONG = {
  id: 'demo-cairo-001',
  name: 'Cairo Roast Coffee',
  category: 'cafe',
  area: 'Cairo',
  address: '12 Tahrir Square, Cairo',
  phone: '+20-100-000-0001',
  whatsapp: '+20-100-000-0001',
  email: 'hello@cairoroast.example',
  rating: 4.4,
  reviews: 200,
  instagram: 'https://instagram.com/cairoroast',
  facebook: 'https://facebook.com/cairoroast',
  photos: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg'],
  menus: ['/menu.pdf', '/menu2.pdf'],
  booking: 'https://booking.example/cairoroast',
  openingHours: ['Sat-Thu 08:00-22:00'],
  collectedAt: '2026-01-01T00:00:00.000Z'
};

const HAS_WEBSITE = {
  id: 'demo-cairo-004',
  name: 'Old Cairo Antiques',
  category: 'other',
  area: 'Cairo',
  address: '3 Al-Muizz Street',
  phone: '+20-100-000-0004',
  whatsapp: '+20-100-000-0004',
  email: 'sales@oldcairoantiques.example',
  rating: 4.2,
  reviews: 80,
  website: 'https://oldcairoantiques.example',
  instagram: 'https://instagram.com/oldcairoantiques',
  facebook: 'https://facebook.com/oldcairoantiques',
  premiumWebsite: true,
  probe: { ok: true, status: 200, timeMs: 800, isHttps: true, title: 'Old Cairo Antiques', metaDescription: 'Antiques from Old Cairo', hasH1: true, hasViewport: true, hasLang: 'en' },
  photos: ['p1.jpg', 'p2.jpg', 'p3.jpg'],
  openingHours: ['Sat-Thu 10:00-20:00'],
  collectedAt: '2026-01-01T00:00:00.000Z'
};

const MINIMAL = {
  id: 'demo-cairo-006',
  name: 'Corniche Electronics',
  category: 'other',
  area: 'Cairo',
  address: '5 Corniche El Nil',
  phone: '+20-100-000-0006',
  email: 'support@corniche-electronics.example',
  rating: 4.0,
  reviews: 90,
  collectedAt: '2026-01-01T00:00:00.000Z'
};

let rowCounter = 0;
function rowFor(archetype, idx) {
  const n = rowCounter++;
  const row = {
    ...archetype,
    id: `stress-${archetype.id}-${idx}`,
    name: `${archetype.name} ${idx}`,
    address: `${archetype.address} #${idx}`,
    phone: `+20-200-${String(n).padStart(6, '0')}`,
    email: `hello${n}@stress.example`
  };
  if (archetype.whatsapp) row.whatsapp = row.phone;
  return row;
}

function buildRows() {
  const rows = [];
  for (let i = 0; i < 9; i++) rows.push(rowFor(STRONG, i));
  rows.push({ ...rowFor(STRONG, 99), id: 'stress-target', name: 'Nile Bites Grill' });
  for (let i = 0; i < 10; i++) rows.push(rowFor(HAS_WEBSITE, i));
  for (let i = 0; i < 10; i++) rows.push(rowFor(MINIMAL, i));
  return rows;
}

async function waitTerminal(sys, campaignId, timeoutMs = 300000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED' && last.state !== 'DRAFT' && last.state !== 'QUEUED') return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`campaign stuck in ${last && last.state}`);
}

async function driveApprovals(sys, campaignId, timeoutMs = 300000) {
  let decided = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pending = sys.pendingApprovals();
    if (pending.length) {
      await Promise.all(pending.map((a) => sys.approve(a.id, { by: 'ops', reason: 'stress' })));
      decided += pending.length;
    }
    const s = sys.status(campaignId);
    if (!['RUNNING', 'PAUSED', 'DRAFT', 'QUEUED'].includes(s.state) && sys.pendingApprovals().length === 0) return decided;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('approval driver timed out');
}

export const stress = {
  '30 businesses at maxConcurrent 4: no overshoot, no duplicates, no lost approvals, mixed verdicts, retries absorbed, failures isolated': async () => {
    const root = scratchRoot('stress-30');
    const stressRows = buildRows();
    const stack = await createStack(root, { rows: stressRows });
    const sys = createSystem(root, stack);
    await sys.boot();

    const targetRow = stressRows.find((r) => r.name === 'Nile Bites Grill');
    const targetId = buildRecord(targetRow).id;
    const origExport = stack.website.export.bind(stack.website);
    let targetAttempts = 0;
    stack.website.export = (site, opts = {}) => {
      if (site && site.businessId === targetId) {
        targetAttempts++;
        if (targetAttempts === 1) {
          const err = new Error('simulated transient provider outage');
          err.code = 'E_TR_NETWORK';
          err.meta = { retryable: true };
          throw err;
        }
      }
      return origExport(site, opts);
    };

    const verdicts = {};
    const origEvaluate = sys.adapters.brain.evaluate.bind(sys.adapters.brain);
    sys.adapters.brain.evaluate = async (record) => {
      const result = await origEvaluate(record);
      verdicts[record.id] = result.decision.verdict;
      return result;
    };

    const spec = baseSpec({
      filters: { minOpportunityScore: 0, requireNoWebsiteOrWeak: false },
      limits: {
        maxBusinesses: 30,
        maxConcurrent: 4,
        maxRetries: 2,
        maxAiCalls: 30,
        maxProviderCalls: 40,
        maxDeployments: 40,
        maxExecutionDurationMs: 300000,
        maxCampaignDurationMs: 900000
      }
    });
    const started = sys.startCampaign(spec);
    await sys.runCampaign(started.campaignId);

    const approvedCount = await driveApprovals(sys, started.campaignId);
    const all = await waitTerminal(sys, started.campaignId);

    // ---- verdict mix actually present ----
    const verdictCounts = { APPROVE: 0, REJECT: 0, ESCALATE: 0 };
    for (const v of Object.values(verdicts)) verdictCounts[v]++;
    assert(verdictCounts.APPROVE >= 5 && verdictCounts.REJECT >= 5 && verdictCounts.ESCALATE >= 5,
      `stress run produced a mixed APPROVE/REJECT/ESCALATE set, got ${JSON.stringify(verdictCounts)}`);
    const expectedDeploy = verdictCounts.APPROVE + verdictCounts.ESCALATE;

    // ---- campaign terminal and outcome ----
    assert(all.state === 'COMPLETED', `campaign completes, got ${all.state}`);
    assert(all.metrics.executed === 30, `all 30 businesses executed, got ${all.metrics.executed}`);
    assert(all.metrics.rejected === verdictCounts.REJECT, `all REJECT verdicts terminal-rejected, got ${all.metrics.rejected} vs ${verdictCounts.REJECT}`);
    assert(all.metrics.deployed === expectedDeploy, `every approved/escalated business deploys, got ${all.metrics.deployed} vs ${expectedDeploy}`);
    assert(all.metrics.failed === 0, `no permanent failures (retries absorbed), got ${all.metrics.failed}`);

    // ---- no counter overshoot ----
    const budget = all.budget.counters;
    assert(budget.businesses === 30, `businesses counter exact, got ${budget.businesses}`);
    assert(budget.aiCalls === 30, `every business evaluated exactly once, got ${budget.aiCalls}`);
    assert(budget.deployments >= all.metrics.deployed && budget.deployments <= 40, `deployments counter within cap, got ${budget.deployments}`);
    assert(budget.providerCalls >= all.metrics.deployed && budget.providerCalls <= 40, `providerCalls counter within cap, got ${budget.providerCalls}`);
    assert(budget.deployments === budget.providerCalls, `deployment and provider counters move together, got ${budget.deployments}/${budget.providerCalls}`);

    // ---- retries happened for the injected business ----
    assert(targetAttempts >= 2, `transient failure was retried, got ${targetAttempts} attempts`);
    const failedWithNetwork = all.executions.some((e) => {
      const full = sys.getExecution(e.executionId);
      return full.error && full.error.code === 'E_TR_NETWORK';
    });
    assert(!failedWithNetwork, 'no execution carries the transient network error (absorbed by retry)');

    // ---- no duplicate executions ----
    const executionIds = all.executions.map((e) => e.executionId);
    assert(new Set(executionIds).size === executionIds.length, 'every execution id is unique');
    const businessIds = all.executions.map((e) => e.businessId);
    assert(new Set(businessIds).size === 30, `one execution per business, got ${businessIds.length}`);

    // ---- no duplicate deployments / delivery records ----
    const history = stack.delivery.history();
    const recordIds = history.map((r) => r.id);
    const buildIds = history.map((r) => r.trace && r.trace.buildId);
    assert(buildIds.every((b) => !!b), 'every delivery record carries a build id');
    const dupBuild = buildIds.filter((b, i) => buildIds.indexOf(b) !== i);
    if (dupBuild.length) {
      console.log('[stress-diag] duplicated buildIds:', JSON.stringify([...new Set(dupBuild)]));
      for (const r of history.filter((x) => dupBuild.includes(x.trace && x.trace.buildId))) {
        console.log(`[stress-diag]   record ${r.id} status=${r.status} businessId=${r.businessId}`);
      }
    }
    assert(new Set(buildIds).size === buildIds.length, 'delivery build ids are unique');
    const live = history.filter((r) => ['recorded', 'deployed'].includes(r.status));
    assert(live.length === expectedDeploy, `exactly ${expectedDeploy} live deployments, got ${live.length}`);
    const liveBuildIds = new Set(live.map((r) => r.trace && r.trace.buildId));
    const liveRecordIds = new Set(live.map((r) => r.id));
    assert(liveBuildIds.size === live.length && liveRecordIds.size === live.length, 'no duplicate live deployment');

    // ---- no illegal state transitions: exact terminal set ----
    const statuses = {};
    for (const e of all.executions) statuses[e.status] = (statuses[e.status] || 0) + 1;
    assert(statuses.DEPLOYED === expectedDeploy, `DEPLOYED count matches, got ${JSON.stringify(statuses)}`);
    assert(statuses.REJECTED === verdictCounts.REJECT, `REJECTED count matches, got ${JSON.stringify(statuses)}`);
    assert(statuses.FAILED === undefined, `no FAILED executions, got ${JSON.stringify(statuses)}`);

    // ---- no lost approvals ----
    const expectedApprovals = verdictCounts.ESCALATE + expectedDeploy;
    assert(approvedCount === expectedApprovals, `every requested approval was decided, got ${approvedCount} vs ${expectedApprovals}`);
    assert(sys.pendingApprovals().length === 0, `no undecided approvals remain, got ${sys.pendingApprovals().length}`);
    for (const e of all.executions) {
      const full = sys.getExecution(e.executionId);
      assert(['DEPLOYED', 'REJECTED', 'FAILED', 'ARCHIVED'].includes(full.status), `execution ${e.executionId} reached a legal terminal state, got ${full.status}`);
    }

    sys.close();
  }
};

async function main() {
  const ok = await runTests('stress', stress);
  process.exit(ok ? 0 : 1);
}

main();
