import fs from 'node:fs';
import path from 'node:path';
import { readJson, readNdjson, ensureDir } from '../utils.js';

// Read-only reader for existing orchestrator / delivery / scheduler records.
// Intelligence never writes through these paths — this module only opens files
// for reading (enforced by the security suite's storage-diff test).
export class RecordsReader {
  constructor({ orchestratorRoot, deliveryRoot, schedulerBaseDir, caps = {} }) {
    this.orchestratorRoot = orchestratorRoot;
    this.deliveryRoot = deliveryRoot;
    this.schedulerBaseDir = schedulerBaseDir;
    this.caps = { maxCampaigns: 500, maxRecords: 5000, maxHistory: 10000, ...caps };
  }

  campaignIds() {
    const dir = path.join(this.orchestratorRoot, 'campaigns');
    try {
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort()
        .slice(0, this.caps.maxCampaigns);
    } catch {
      return [];
    }
  }

  readCampaign(campaignId) {
    const file = path.join(this.orchestratorRoot, 'campaigns', `${campaignId}.json`);
    if (!fs.existsSync(file)) return null;
    return readJson(file, null);
  }

  readDecision(executionId) {
    const file = path.join(this.orchestratorRoot, 'instances', executionId, 'decision.json');
    if (!fs.existsSync(file)) return null;
    return readJson(file, null);
  }

  // Whether an execution's decision record exists (4.7.0 observations
  // import). Contained: the id is sanitized before any path use.
  hasExecution(executionId) {
    const id = String(executionId || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!id) return false;
    return fs.existsSync(path.join(this.orchestratorRoot, 'instances', id, 'decision.json'));
  }

  readExecutionReport(executionId) {
    const file = path.join(this.orchestratorRoot, 'instances', executionId, 'execution-report.json');
    if (!fs.existsSync(file)) return null;
    return readJson(file, null);
  }

  readTrace(executionId) {
    const file = path.join(this.orchestratorRoot, 'instances', executionId, 'trace.ndjson');
    if (!fs.existsSync(file)) return [];
    return readNdjson(file);
  }

  deliveryRecords() {
    const dir = path.join(this.deliveryRoot, 'storage', 'delivery', 'records');
    try {
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => readJson(path.join(dir, f), null))
        .filter(Boolean)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .slice(0, this.caps.maxRecords);
    } catch {
      return [];
    }
  }

  readDeliveryRecord(recordId) {
    const file = path.join(this.deliveryRoot, 'storage', 'delivery', 'records', `${String(recordId).replace(/[^a-zA-Z0-9._-]/g, '')}.json`);
    if (!fs.existsSync(file)) return null;
    return readJson(file, null);
  }

  // Scheduler job history: {jobId: [run records]}. Reads the persisted file
  // directly (read-only) so post-hardening data is aggregated as-is.
  schedulerHistory() {
    const file = path.join(this.schedulerBaseDir, '_history.json');
    if (!fs.existsSync(file)) return {};
    const raw = readJson(file, {});
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    let total = 0;
    for (const [jobId, runs] of Object.entries(raw)) {
      if (!Array.isArray(runs)) continue;
      out[jobId] = runs.slice(-this.caps.maxHistory);
      total += runs.length;
      if (total > this.caps.maxHistory) break;
    }
    return out;
  }

  schedulerJobs() {
    const file = path.join(this.schedulerBaseDir, '_jobs.json');
    if (!fs.existsSync(file)) return [];
    const raw = readJson(file, []);
    return Array.isArray(raw) ? raw : [];
  }
}

export { ensureDir };
