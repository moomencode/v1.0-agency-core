import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createValidator } from '../runtime/validator.js';
import { nowIso, slugify, shortHash, writeJson, readJson, ensureDir, atomicWrite } from '../runtime/utils.js';
import { disError, DIS_CODES } from './errors.js';
import { DEFAULT_SOURCES, finalizeProbe } from './sources.js';
import { mergeCandidates, buildRecord } from './enrich.js';
import { detectWeaknesses, weaknessesCatalog } from './weaknesses.js';
import { scoreRecord, assignRanks, priorityTier } from './scoring.js';
import { buildRecordReport, buildSummaryReport, toMarkdown } from './reports.js';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

export class DiscoveryEngine {
  constructor({ root = MODULE_ROOT, sources = null, fetchImpl = null, probeMode = 'online', probeWebsites = true, validator = null, artifactSystem = null, logger = null } = {}) {
    this.root = path.resolve(root);
    this.storageDir = path.join(this.root, 'storage', 'discovery-engine');
    this.businessDir = path.join(this.storageDir, 'businesses');
    this.indexFile = path.join(this.storageDir, 'index.json');
    this.probeMode = probeMode;
    this.probeWebsites = probeWebsites;
    this.artifactSystem = artifactSystem || null;
    this.logger = logger;
    this.runCounter = 0;

    this.registry = new Map();
    const builders = sources && Object.keys(sources).length ? sources : DEFAULT_SOURCES;
    for (const [id, builder] of Object.entries(builders)) {
      const source = typeof builder === 'function' ? builder({ fetchImpl, probeMode }) : builder;
      this.registerSource(source);
    }

    this.validator = validator === true ? DiscoveryEngine.createDefaultValidator() : validator || null;
    this.recordSchema = null;
    if (this.validator) {
      const schemaFile = path.join(MODULE_ROOT, 'schemas', 'business-discovery.schema.json');
      this.recordSchema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
    }
    this.totals = { runs: 0, discovered: 0, saved: 0, skipped: 0 };
  }

  static createDefaultValidator() {
    return createValidator({ schemasDir: path.join(MODULE_ROOT, 'schemas') });
  }

  registerSource(source) {
    if (!source || !source.id || typeof source.discover !== 'function') {
      throw disError(DIS_CODES.UNKNOWN_SOURCE, 'invalid source adapter', { id: source && source.id });
    }
    for (const method of ['normalize', 'validate', 'enrich', 'score']) {
      if (typeof source[method] !== 'function') {
        throw disError(DIS_CODES.UNKNOWN_SOURCE, `source "${source.id}" must implement ${method}()`, { method });
      }
    }
    this.registry.set(source.id, source);
    return source;
  }

  sources() {
    return [...this.registry.values()].map((s) => ({ id: s.id, name: s.name, ready: !!s.ready }));
  }

  source(id) {
    if (!this.registry.has(id)) throw disError(DIS_CODES.UNKNOWN_SOURCE, `unknown source "${id}"`);
    return this.registry.get(id);
  }

  validateQuery(query) {
    if (!query || typeof query !== 'object') throw disError(DIS_CODES.QUERY_INVALID, 'query must be an object');
    if (!query.all && !query.term && !query.category && !query.area && !query.domains) {
      throw disError(DIS_CODES.QUERY_INVALID, 'query must provide all, term, category, area or domains', { query });
    }
  }

  async discover(query, { sources = null } = {}) {
    this.validateQuery(query);
    const wanted = sources && sources.length ? sources : [...this.registry.keys()];
    const skipped = [];
    const invalid = [];
    const perSource = {};
    const candidates = [];
    for (const id of wanted) {
      const source = this.registry.get(id);
      if (!source) throw disError(DIS_CODES.UNKNOWN_SOURCE, `unknown source "${id}"`);
      if (!source.ready) {
        skipped.push(id);
        continue;
      }
      let rows;
      try {
        rows = await source.discover(query, { domains: query.domains });
      } catch (e) {
        throw disError(DIS_CODES.SOURCE_FAILED, `source "${id}" failed: ${e.message}`, { source: id });
      }
      perSource[id] = Array.isArray(rows) ? rows.length : 0;
      for (const row of Array.isArray(rows) ? rows : []) {
        let candidate = row;
        try {
          candidate = (await source.normalize(row)) ?? row;
        } catch (e) {
          invalid.push({ source: id, error: `normalize: ${e.message}` });
          continue;
        }
        let check;
        try {
          check = source.validate(candidate);
        } catch (e) {
          invalid.push({ source: id, error: `validate: ${e.message}` });
          continue;
        }
        if (!check || !check.valid) {
          invalid.push({ source: id, errors: (check && check.errors) || [{ message: 'invalid candidate' }] });
          continue;
        }
        let enriched = candidate;
        try {
          enriched = (await source.enrich(candidate)) ?? candidate;
        } catch (e) {
          invalid.push({ source: id, error: `enrich: ${e.message}` });
          continue;
        }
        const signals = source.score(enriched) || null;
        const tagged = { ...enriched, sources: [...new Set([...(enriched.sources || []), id])] };
        if (signals) tagged._sourceSignals = { [id]: signals };
        candidates.push(tagged);
      }
    }
    if (!candidates.length) {
      if (skipped.length === wanted.length) {
        throw disError(DIS_CODES.SOURCE_UNAVAILABLE, `no configured source can answer this query (skipped: ${skipped.join(', ')})`, { skipped });
      }
      throw disError(DIS_CODES.NO_CANDIDATES, 'no business candidates found for query', { query });
    }
    return { candidates, skipped, invalid, perSource };
  }

  detect(record) {
    record.weaknesses = detectWeaknesses(record);
    return record.weaknesses;
  }

  score(record) {
    return scoreRecord(record);
  }

  validateRecord(record) {
    if (!this.validator) return { valid: true, errors: [] };
    return this.validator.validate(record, this.recordSchema, { schemaPath: 'discovery:record' });
  }

  report(record) {
    return buildRecordReport(record);
  }

  async save(record, { artifact = true } = {}) {
    const check = this.validateRecord(record);
    if (!check.valid) {
      throw disError(DIS_CODES.RECORD_INVALID, `discovery record for "${record.name}" failed schema validation`, { errors: check.errors.slice(0, 10) });
    }
    ensureDir(this.businessDir);
    const file = path.join(this.businessDir, `${slugify(record.name)}-${shortHash(record.id, 8)}.json`);
    record.savedAt = nowIso();
    writeJson(file, record);

    const index = this._readIndex();
    index.entries = index.entries.filter((e) => e.id !== record.id);
    index.entries.push({
      id: record.id,
      file: path.relative(this.storageDir, file),
      name: record.name,
      category: record.category,
      area: record.area,
      business: record.scores.business.value,
      opportunity: record.scores.opportunity.value,
      priority: record.scores.salesPriority.tier,
      weaknesses: record.weaknesses.length,
      savedAt: record.savedAt
    });
    index.updatedAt = nowIso();
    writeJson(this.indexFile, index);

    if (artifact && this.artifactSystem) {
      try {
        this.artifactSystem.create({
          name: `${slugify(record.name)}-discovery`,
          type: 'document',
          format: 'json',
          content: JSON.stringify(record, null, 2),
          workflowId: 'business-discovery',
          projectId: record.area,
          title: record.name,
          summary: `${record.category} - opportunity ${record.scores.opportunity.value} (${record.scores.salesPriority.tier})`,
          tags: ['discovery', record.category, record.scores.salesPriority.tier],
          metadata: {
            businessScore: record.scores.business.value,
            opportunityScore: record.scores.opportunity.value,
            priority: record.scores.salesPriority.tier,
            weaknesses: record.weaknesses.map((w) => w.id)
          }
        });
      } catch (e) {
        if (this.logger) this.logger.warn('artifact write failed', { id: record.id, error: e.message });
      }
    }
    return record;
  }

  async run(query, opts = {}) {
    this.validateQuery(query);
    const startedAt = nowIso();
    const t0 = Date.now();
    const { candidates, skipped, invalid, perSource } = await this.discover(query, opts);
    const merged = mergeCandidates(candidates);
    const records = [];
    for (const candidate of merged) {
      const probe = finalizeProbe(candidate.probe || candidate.simulatedProbe || null);
      const record = buildRecord(candidate, { probe });
      if (candidate._sourceSignals) record.sourceSignals = candidate._sourceSignals;
      this.detect(record);
      this.score(record);
      records.push(record);
    }
    assignRanks(records);

    const saved = [];
    const errors = [];
    for (const record of records) {
      try {
        await this.save(record, { artifact: opts.artifact !== false });
        saved.push(record);
      } catch (e) {
        errors.push({ id: record.id, name: record.name, error: e.message });
      }
    }

    this.runCounter++;
    this.totals.runs++;
    this.totals.discovered += merged.length;
    this.totals.saved += saved.length;
    this.totals.skipped += errors.length;

    const finishedAt = nowIso();
    const durationMs = Date.now() - t0;
    const probed = records.reduce((acc, r) => {
      if (r.probe) {
        acc.attempted++;
        if (r.probe.ok) acc.ok++;
        else acc.failed++;
      }
      return acc;
    }, { attempted: 0, ok: 0, failed: 0 });
    const avg = (key) => (saved.length ? Math.round(saved.reduce((a, r) => a + r.scores[key].value, 0) / saved.length) : 0);
    const tierCounts = saved.reduce((acc, r) => {
      const tier = r.scores.salesPriority.tier;
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, { high: 0, medium: 0, low: 0 });
    const weaknessHistogram = saved.reduce((acc, r) => {
      for (const w of r.weaknesses) acc[w.id] = (acc[w.id] || 0) + 1;
      return acc;
    }, {});

    const runId = `run-${Date.now().toString(36)}-${this.runCounter}`;
    const metrics = {
      startedAt,
      finishedAt,
      durationMs,
      sources: perSource,
      candidatesTotal: candidates.length,
      invalidDropped: invalid.length,
      skippedSources: skipped,
      merged: merged.length,
      probed,
      saved: saved.length,
      saveErrors: errors.length,
      avgBusiness: avg('business'),
      avgOpportunity: avg('opportunity'),
      tierCounts,
      weaknesses: weaknessHistogram
    };

    await this._writeRunEvidence(runId, query, metrics, saved);
    const summary = {
      runId,
      query,
      sources: { used: saved.length ? [...new Set(saved.map((m) => m.sources).flat())] : [], skipped },
      discovered: merged.length,
      saved: saved.length,
      errors: errors.length,
      metrics,
      topPriority: saved.length ? { name: saved[0].name, opportunity: saved[0].scores.opportunity.value, tier: saved[0].scores.salesPriority.tier } : null
    };
    if (this.logger) this.logger.info('discovery run complete', summary);
    return { ...summary, businesses: saved, errors };
  }

  async _writeRunEvidence(runId, query, metrics, records) {
    const runDir = path.join(this.storageDir, 'runs', runId);
    ensureDir(runDir);
    ensureDir(path.join(runDir, 'businesses'));
    writeJson(path.join(runDir, 'summary.json'), buildSummaryReport({ runId, query, metrics, records }));
    writeJson(path.join(runDir, 'export.json'), { runId, exportedAt: metrics.finishedAt, count: records.length, records });
    atomicWrite(path.join(runDir, 'report.md'), toMarkdown({ runId, query, metrics, records }));
    for (const record of records) {
      writeJson(path.join(runDir, 'businesses', `${slugify(record.name)}-${shortHash(record.id, 8)}.json`), record);
    }
  }

  _readIndex() {
    const index = readJson(this.indexFile, null);
    if (index && Array.isArray(index.entries)) return index;
    return { version: 1, updatedAt: nowIso(), entries: [] };
  }

  list() {
    return this._readIndex().entries;
  }

  load(id) {
    const entry = this.list().find((e) => e.id === id);
    if (!entry) throw disError(DIS_CODES.NOT_FOUND, `no discovery record with id "${id}"`);
    const record = readJson(path.join(this.storageDir, entry.file), null);
    if (!record) throw disError(DIS_CODES.NOT_FOUND, `record file missing for id "${id}"`);
    return record;
  }

  search(term, { category = null, area = null, priority = null, weakness = null } = {}) {
    let entries = this.list();
    if (term) {
      const t = String(term).toLowerCase();
      entries = entries.filter((e) => e.name.toLowerCase().includes(t) || e.category.toLowerCase().includes(t) || e.area.toLowerCase().includes(t));
    }
    if (category) entries = entries.filter((e) => e.category === category);
    if (area) entries = entries.filter((e) => String(e.area).toLowerCase().includes(String(area).toLowerCase()));
    if (priority) entries = entries.filter((e) => e.priority === priority);
    if (weakness) entries = entries.filter((e) => this._hasWeakness(e.id, weakness));
    return entries;
  }

  _hasWeakness(id, weakness) {
    const entry = this.list().find((e) => e.id === id);
    if (!entry) return false;
    const record = readJson(path.join(this.storageDir, entry.file), null);
    return record ? record.weaknesses.some((w) => w.id === weakness) : false;
  }

  async export(file = path.join(this.storageDir, 'export.json')) {
    const records = this.list().map((e) => this.load(e.id));
    writeJson(file, { exportedAt: nowIso(), count: records.length, records });
    return file;
  }

  stats() {
    const entries = this.list();
    const byCategory = {};
    const byPriority = {};
    const weaknesses = {};
    for (const e of entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byPriority[e.priority] = (byPriority[e.priority] || 0) + 1;
      const record = readJson(path.join(this.storageDir, e.file), null);
      if (record) for (const w of record.weaknesses) weaknesses[w.id] = (weaknesses[w.id] || 0) + 1;
    }
    return {
      ...this.totals,
      persisted: entries.length,
      byCategory,
      byPriority,
      weaknesses,
      avgOpportunity: entries.length ? Math.round(entries.reduce((a, e) => a + e.opportunity, 0) / entries.length) : 0
    };
  }

  weaknesses() {
    return weaknessesCatalog();
  }

  priorities() {
    return { high: 70, medium: 50, tiers: ['high', 'medium', 'low'], fn: priorityTier };
  }

  close() {
    this.validator = null;
    this.registry.clear();
  }
}
