import { assert, runTests, scratchRoot } from './helpers.mjs';
import { ApprovalStore, APPROVAL_KINDS } from '../approval/store.js';
import { ORC_CODES } from '../errors.js';

const root = scratchRoot('approval');

export const approval = {
  'request creates a pending record': () => {
    const store = new ApprovalStore({ root });
    const rec = store.request({ executionId: 'exec-1', campaignId: 'cmp-1', kind: 'DEPLOY', step: 'deploy', requestedBy: 'workflow' });
    assert(rec.id.startsWith('apr-'));
    assert(rec.executionId === 'exec-1');
    assert(rec.kind === 'DEPLOY');
    assert(rec.decision === null);
    assert(rec.terminal === false);
    assert(store.get(rec.id).id === rec.id);
  },

  'request is idempotent for same execution/kind/step': () => {
    const store = new ApprovalStore({ root });
    const a = store.request({ executionId: 'exec-2', campaignId: 'cmp-1', kind: 'DEPLOY', step: 'deploy', requestedBy: 'workflow' });
    const b = store.request({ executionId: 'exec-2', campaignId: 'cmp-1', kind: 'DEPLOY', step: 'deploy', requestedBy: 'workflow' });
    assert(a.id === b.id, 'same inputs must produce the same approval id');
    assert(store.all().filter((x) => x.id === a.id).length === 1, 'no duplicate records');
  },

  'different step or kind creates a distinct record': () => {
    const store = new ApprovalStore({ root });
    const a = store.request({ executionId: 'exec-3', campaignId: 'cmp-1', kind: 'ESCALATE', step: 'evaluate', requestedBy: 'workflow' });
    const b = store.request({ executionId: 'exec-3', campaignId: 'cmp-1', kind: 'DEPLOY', step: 'deploy', requestedBy: 'workflow' });
    assert(a.id !== b.id);
  },

  'unknown kind rejected': () => {
    const store = new ApprovalStore({ root });
    let threw = null;
    try {
      store.request({ executionId: 'x', campaignId: 'c', kind: 'NOPE', step: 's' });
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.code === ORC_CODES.APPROVAL_INVALID);
    assert(APPROVAL_KINDS.includes('ESCALATE'));
    assert(APPROVAL_KINDS.includes('MANUAL_STEP'));
  },

  'decide grants immutably': () => {
    const store = new ApprovalStore({ root });
    const rec = store.request({ executionId: 'exec-4', campaignId: 'cmp-1', kind: 'QA_OVERRIDE', step: 'run-qa', requestedBy: 'operator' });
    const decided = store.decide(rec.id, { granted: true, decidedBy: 'ops-user', reason: 'evidence ok' });
    assert(decided.decision.granted === true);
    assert(decided.decision.decidedBy === 'ops-user');
    assert(decided.decision.reason === 'evidence ok');
    assert(decided.terminal === true);
    assert(store.isDecided(rec.id) === true);
    let threw = null;
    try {
      store.decide(rec.id, { granted: false, decidedBy: 'ops-user' });
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.code === ORC_CODES.APPROVAL_NOT_PENDING, 'decided approvals are immutable');
  },

  'decide requires decidedBy': () => {
    const store = new ApprovalStore({ root });
    const rec = store.request({ executionId: 'exec-5', campaignId: 'cmp-1', kind: 'SENSITIVE', step: 'rollback', requestedBy: 'operator' });
    let threw = null;
    try {
      store.decide(rec.id, { granted: true });
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.code === ORC_CODES.APPROVAL_INVALID);
  },

  'decide on unknown id throws': () => {
    const store = new ApprovalStore({ root });
    let threw = null;
    try {
      store.decide('apr-none', { granted: true, decidedBy: 'x' });
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.code === ORC_CODES.APPROVAL_INVALID);
  },

  'pending filters by execution and excludes decided': () => {
    const store = new ApprovalStore({ root });
    const p1 = store.request({ executionId: 'exec-6', campaignId: 'cmp-1', kind: 'ESCALATE', step: 'evaluate', requestedBy: 'workflow' });
    store.request({ executionId: 'exec-6', campaignId: 'cmp-1', kind: 'DEPLOY', step: 'deploy', requestedBy: 'workflow' });
    const other = store.request({ executionId: 'exec-7', campaignId: 'cmp-1', kind: 'DEPLOY', step: 'deploy', requestedBy: 'workflow' });
    store.decide(p1.id, { granted: true, decidedBy: 'ops' });
    assert(store.pending('exec-6').length === 1, 'decided excluded, other kind pending');
    assert(store.pending('exec-6')[0].kind === 'DEPLOY');
    assert(store.pending('exec-7').length === 1);
    assert(store.pending('exec-6').every((a) => a.terminal === false), 'pending must exclude decided');
    assert(store.byExecution('exec-6').length === 2);
    assert(store.byExecution('exec-7')[0].id === other.id);
  },

  'evidenceFor summarizes decisions': () => {
    const store = new ApprovalStore({ root });
    const rec = store.request({ executionId: 'exec-8', campaignId: 'cmp-1', kind: 'DEPLOY', step: 'deploy', requestedBy: 'workflow' });
    store.decide(rec.id, { granted: true, decidedBy: 'ops-user' });
    const evidence = store.evidenceFor('exec-8');
    assert(evidence.length === 1);
    assert(evidence[0].kind === 'DEPLOY');
    assert(evidence[0].granted === true);
    assert(evidence[0].decidedBy === 'ops-user');
  }
};

async function main() {
  const ok = await runTests('approval', approval);
  process.exit(ok ? 0 : 1);
}

main();
