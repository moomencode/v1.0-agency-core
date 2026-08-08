import fs from 'node:fs';
import path from 'node:path';
import { orcError, ORC_CODES } from '../errors.js';
import { approvalIdFor, approvalFile, ensureDir, atomicWrite, readJson, nowIso } from '../utils.js';

export const APPROVAL_KINDS = ['ESCALATE', 'DEPLOY', 'QA_OVERRIDE', 'SENSITIVE', 'POLICY_VIOLATION', 'MANUAL_STEP'];

export class ApprovalStore {
  constructor({ root = null } = {}) {
    this.dir = root ? path.join(root, 'approvals') : null;
  }

  _file(id) {
    return path.join(this.dir, `${id}.json`);
  }

  _load(id) {
    return readJson(this._file(id), null);
  }

  get(id) {
    return this._load(id);
  }

  all() {
    if (!this.dir || !fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson(path.join(this.dir, f), null))
      .filter(Boolean);
  }

  pending(executionId = null) {
    return this.all().filter((a) => !a.terminal && (!executionId || a.executionId === executionId));
  }

  byExecution(executionId) {
    return this.all().filter((a) => a.executionId === executionId);
  }

  purgeCampaign(campaignId) {
    if (!this.dir || !fs.existsSync(this.dir)) return 0;
    let removed = 0;
    for (const f of fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'))) {
      const record = readJson(path.join(this.dir, f), null);
      if (record && record.campaignId === campaignId) {
        try {
          fs.unlinkSync(path.join(this.dir, f));
          removed++;
        } catch {
          /* best effort */
        }
      }
    }
    return removed;
  }

  request({ executionId, campaignId, kind, step, requestedBy = 'workflow', evidence = {} }) {
    if (!APPROVAL_KINDS.includes(kind)) {
      throw orcError(ORC_CODES.APPROVAL_INVALID, `unknown approval kind "${kind}"`, { kind, retryable: false });
    }
    const id = approvalIdFor(executionId, kind, step);
    const existing = this._load(id);
    if (existing) return existing;
    const record = {
      schema: 'https://agency.os/orchestrator/approval',
      id,
      executionId,
      campaignId: campaignId || null,
      kind,
      step: step || null,
      requestedBy,
      requestedAt: nowIso(),
      evidence: evidence || {},
      decision: null,
      terminal: false
    };
    ensureDir(this.dir);
    atomicWrite(this._file(id), JSON.stringify(record, null, 2));
    return record;
  }

  decide(id, { granted, decidedBy, reason = null }) {
    const record = this._load(id);
    if (!record) {
      throw orcError(ORC_CODES.APPROVAL_INVALID, `no approval record with id "${id}"`, { id, retryable: false });
    }
    if (record.terminal || record.decision) {
      throw orcError(ORC_CODES.APPROVAL_NOT_PENDING, `approval "${id}" is already decided and immutable`, {
        id,
        retryable: false
      });
    }
    if (!decidedBy) {
      throw orcError(ORC_CODES.APPROVAL_INVALID, 'decidedBy is required to decide an approval', { id, retryable: false });
    }
    record.decision = {
      granted: Boolean(granted),
      decidedBy,
      decidedAt: nowIso(),
      reason: reason || null
    };
    record.terminal = true;
    atomicWrite(this._file(id), JSON.stringify(record, null, 2));
    return record;
  }

  isDecided(id) {
    const record = this._load(id);
    return !!record && record.terminal;
  }

  evidenceFor(executionId) {
    return this.byExecution(executionId).map((a) => ({
      id: a.id,
      kind: a.kind,
      step: a.step,
      granted: a.decision ? a.decision.granted : null,
      decidedBy: a.decision ? a.decision.decidedBy : null
    }));
  }
}
