import { createStack, scratchRoot, assert, runTests, SIMULATED_ROWS, baseSpec, createSystem } from './helpers.mjs';
import { buildRecord } from '../../discovery/enrich.js';
import { BrainAdapter } from '../integrations/brain.js';
import { DossierAdapter } from '../integrations/dossier.js';

const row = SIMULATED_ROWS.find((r) => r.name === 'Cairo Roast Coffee');

async function waitTerminal(sys, campaignId, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = sys.status(campaignId);
    if (last.state !== 'RUNNING' && last.state !== 'PAUSED' && last.state !== 'DRAFT' && last.state !== 'QUEUED') return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`campaign stuck in ${last && last.state}`);
}

export const chain1 = {
  'brain result preserves the discovery record for dossier construction': async () => {
    const root = scratchRoot('chain1-adapter');
    const stack = await createStack(root);
    const record = buildRecord(row);
    assert(record.name === 'Cairo Roast Coffee', 'fixture record has a real name');

    const brainAdapter = new BrainAdapter({ brain: stack.brain });
    const result = await brainAdapter.evaluate(record);
    assert(result.record === record, 'evaluate attaches the original discovery record to the result');

    const dossierAdapter = new DossierAdapter({ dossier: stack.dossier });
    const dossier = await dossierAdapter.build({ brainResult: result, requireApproved: false, persist: false });
    assert(dossier.businessName === 'Cairo Roast Coffee', `real name reaches the dossier (got "${dossier.businessName}")`);
    assert(dossier.businessName !== 'Unknown Business', 'no Unknown Business fallback');
    assert(dossier.businessId === record.id, 'dossier bound to the real business id');
  },

  'full campaign persists a dossier carrying the real business identity': async () => {
    const root = scratchRoot('chain1-campaign');
    const stack = await createStack(root, { rows: SIMULATED_ROWS.slice(0, 2) });
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec({ limits: { ...baseSpec().limits, maxBusinesses: 2 } }));
    await sys.runCampaign(started.campaignId);
    for (let round = 0; round < 6; round++) {
      const pending = sys.pendingApprovals();
      if (!pending.length) break;
      for (const a of pending) sys.approve(a.id, { by: 'ops', reason: 'chain1' });
      await new Promise((r) => setTimeout(r, 1500));
    }
    const all = await waitTerminal(sys, started.campaignId);
    assert(all.state === 'COMPLETED', `campaign completes (${all.state})`);

    const businessId = buildRecord(row).id;
    const loaded = stack.dossier.load(businessId);
    assert(loaded, 'dossier persisted for the business');
    const name = loaded.documents.business.name;
    assert(name === 'Cairo Roast Coffee', `persisted dossier uses the real name (got "${name}")`);
    assert(name !== 'Unknown Business', 'no fallback identity in the persisted dossier');
    sys.close();
  }
};

const ok = await runTests('orchestrator/chain1', chain1);
process.exit(ok ? 0 : 1);
