import fs from 'node:fs';
import path from 'node:path';
import { safeForLog } from '../../delivery/security/redaction.js';
import {
  instanceRoot,
  traceNdjsonFile,
  traceJsonFile,
  executionReportFile,
  ensureDir,
  atomicWrite,
  readJson,
  nowIso
} from '../utils.js';

export class TraceCollector {
  constructor({ root = null, executionId = null, campaignId = null, businessId = null, vault = null } = {}) {
    this.root = root;
    this.executionId = executionId;
    this.campaignId = campaignId;
    this.businessId = businessId;
    this.vault = vault || null;
  }

  _file() {
    return traceNdjsonFile(this.root, this.executionId);
  }

  append(entry) {
    if (!this.root) return;
    ensureDir(instanceRoot(this.root, this.executionId));
    const line = {
      executionId: this.executionId,
      campaignId: this.campaignId,
      businessId: this.businessId,
      workflowId: `${this.campaignId}:${entry.workflowVersion || 'v1'}`,
      ...entry,
      at: entry.at || nowIso()
    };
    fs.appendFileSync(this._file(), `${JSON.stringify(safeForLog(line, { vault: this.vault }))}\n`);
  }

  events() {
    if (!this.root || !fs.existsSync(this._file())) return [];
    return fs
      .readFileSync(this._file(), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  assemble({ outcome = null, outputs = {} } = {}) {
    const events = this.events();
    const last = events[events.length - 1] || {};
    const trace = {
      schema: 'https://agency.os/orchestrator/execution-trace',
      executionId: this.executionId,
      campaignId: this.campaignId,
      businessId: this.businessId,
      workflowId: `${this.campaignId}:${last.workflowVersion || 'v1'}`,
      dossierVersion: outputs.dossierVersion || null,
      pipelineRunId: outputs.pipelineRunId || null,
      engineRunId: outputs.buildId || null,
      deliveryRecordId: outputs.deliveryRecordId || null,
      outcome: outcome || last.outcome || null,
      events,
      assembledAt: nowIso()
    };
    return trace;
  }

  writeAssembled({ outcome = null, outputs = {} } = {}) {
    if (!this.root) return null;
    const trace = this.assemble({ outcome, outputs });
    atomicWrite(traceJsonFile(this.root, this.executionId), JSON.stringify(trace, null, 2));
    return trace;
  }

  writeReport(report) {
    if (!this.root) return null;
    ensureDir(instanceRoot(this.root, this.executionId));
    atomicWrite(executionReportFile(this.root, this.executionId), JSON.stringify(safeForLog(report, { vault: this.vault }), null, 2));
    return executionReportFile(this.root, this.executionId);
  }
}
