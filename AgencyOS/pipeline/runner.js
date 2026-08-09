import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRegistry } from './registry.js';
import { normalizeDossier } from './normalize.js';
import { planSections } from './sections.js';
import { generateThemeTokens } from './theme.js';
import { generateAssetsManifest } from './manifest.js';
import { generateStructuredData } from './structured-data.js';
import { generateLocalization } from './localization.js';
import { buildConfigs } from './config/index.js';
import { buildReports } from './reports.js';
import { runQA } from './qa.js';
import { CONFIG_IDS, getConfigSchema } from './schemas/index.js';
import { pipError, PIP_CODES } from './errors.js';
import { hashShort, stableJson } from './utils.js';

export const PIPELINE_EVENTS = {
  PIPELINE_STARTED: 'pipeline.started',
  STAGE_STARTED: 'pipeline.stage.started',
  STAGE_COMPLETED: 'pipeline.stage.completed',
  STAGE_FAILED: 'pipeline.stage.failed',
  QA_COMPLETED: 'pipeline.qa.completed',
  PIPELINE_COMPLETED: 'pipeline.completed',
  PIPELINE_FAILED: 'pipeline.failed'
};

export const STAGES = [
  'validate',
  'normalize',
  'generate-theme',
  'generate-sections',
  'generate-assets-manifest',
  'generate-config',
  'generate-navigation',
  'generate-seo',
  'generate-structured-data',
  'generate-localization',
  'generate-build-package',
  'qa-validation',
  'website-ready'
];

export class PipelineRunner {
  constructor({ root = null, bus = null, validator = null, logger = null, memory = null, registry = null } = {}) {
    this.root = root ? path.resolve(root) : null;
    this.bus = bus || null;
    this.logger = logger || null;
    this.validator = validator || null;
    this.memory = memory || null;
    this.registry = registry || createRegistry();
  }

  _emit(name, runId, detail) {
    if (this.bus && typeof this.bus.emitEvent === 'function') {
      try { this.bus.emitEvent(name, { runId }, detail); } catch { /* bus is best-effort */ }
    } else if (this.bus && typeof this.bus.emitter?.emit === 'function') {
      try { this.bus.emitter.emit(name, { runId, ...detail }); } catch { }
    }
  }

  _log(level, message, meta = {}) {
    this.logger?.[level]?.(message, meta);
  }

  _safeRunId(runId) {
    return String(runId || 'run').replace(/[^A-Za-z0-9._-]/g, '_');
  }

  _checkpointDir() {
    if (!this.root) return null;
    return path.join(this.root, 'checkpoints');
  }

  async _saveCheckpoint(runId, stageId, payload) {
    const dir = this._checkpointDir();
    if (!dir) return;
    const runDir = path.join(dir, this._safeRunId(runId));
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, `${stageId}.json`), stableJson(payload), 'utf8');
  }

  async _loadCheckpoint(runId, stageId) {
    const dir = this._checkpointDir();
    if (!dir) return null;
    try {
      return JSON.parse(await readFile(path.join(dir, this._safeRunId(runId), `${stageId}.json`), 'utf8'));
    } catch {
      return null;
    }
  }

  async _saveRunState(runId, state) {
    if (!this.root) return;
    const safe = this._safeRunId(runId);
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(this.root, `run-state-${safe}.json`), stableJson(state), 'utf8');
  }

  async _loadRunState(runId) {
    if (!this.root) return null;
    try {
      return JSON.parse(await readFile(path.join(this.root, `run-state-${this._safeRunId(runId)}.json`), 'utf8'));
    } catch {
      return null;
    }
  }

  async _removeRunState(runId) {
    if (!this.root) return;
    try {
      await rm(path.join(this.root, `run-state-${this._safeRunId(runId)}.json`));
    } catch {
      /* best effort cleanup */
    }
  }

  async hasRunState(runId) {
    if (!this.root) return false;
    try {
      const raw = await readFile(path.join(this.root, `run-state-${this._safeRunId(runId)}.json`), 'utf8');
      return Boolean(raw);
    } catch {
      return false;
    }
  }

  async run(dossier, { runId = null, resume = false, businessId = null, pipelineId = 'website-production' } = {}) {
    const pipelineDef = this.registry.get(pipelineId);
    const runIdFinal = runId || `run-${hashShort(businessId || 'dossier', 10)}-${pipelineDef.id}`;

    let state = resume ? await this._loadRunState(runIdFinal) : null;
    const fresh = !state;
    const completed = new Set(fresh ? [] : state.completedStages || []);
    const ctx = {
      runId: runIdFinal,
      pipelineId,
      pipelineVersion: pipelineDef.apiVersion || '1.0',
      businessId,
      startedAt: state?.startedAt || new Date().toISOString(),
      status: 'running',
      resumed: !fresh,
      stages: [],
      configs: {},
      checksums: {},
      themeTokens: null,
      defaultMode: 'dark',
      sections: null,
      manifest: null,
      structuredData: null,
      validation: { perConfig: [], allValid: false, validator: this.validator ? 'wired' : 'builtin' },
      qa: null,
      qaPassed: false,
      qaChecks: 0,
      outputRoot: this.root ? path.join(this.root, 'build') : null,
      configCount: 0,
      reportCount: 0
    };

    if (!fresh) {
      for (const k of ['configs', 'themeTokens', 'defaultMode', 'sections', 'manifest', 'structuredData', 'qa', 'qaPassed', 'qaChecks', 'validation']) {
        if (state[k] !== undefined) ctx[k] = state[k];
      }
    }

    this._emit(PIPELINE_EVENTS.PIPELINE_STARTED, runIdFinal, { pipelineId, resumed: ctx.resumed });

    const sorted = this.registry.sortStages(pipelineId);
    for (const stageId of sorted) {
      const def = pipelineDef.stages.find((s) => s.id === stageId);
      const start = Date.now();
      if (completed.has(stageId)) {
        const checkpoint = await this._loadCheckpoint(runIdFinal, stageId);
        if (checkpoint) this._mergeCheckpoint(ctx, stageId, checkpoint);
        ctx.stages.push({ id: stageId, ok: true, resumed: true, durationMs: 0, detail: 'resumed from checkpoint' });
        continue;
      }
      this._emit(PIPELINE_EVENTS.STAGE_STARTED, runIdFinal, { stage: stageId });
      this._log('info', `pipeline stage: ${stageId}`, { runId: ctx.runId });
      try {
        const payload = await this._runStage(stageId, ctx, dossier);
        if (payload !== undefined) await this._saveCheckpoint(runIdFinal, stageId, payload);
        completed.add(stageId);
        const durationMs = Date.now() - start;
        ctx.stages.push({ id: stageId, ok: true, resumed: false, durationMs, detail: payload?.detail || '' });
        this._emit(PIPELINE_EVENTS.STAGE_COMPLETED, runIdFinal, { stage: stageId, durationMs });
      } catch (e) {
        const durationMs = Date.now() - start;
        ctx.stages.push({ id: stageId, ok: false, resumed: false, durationMs, detail: e.message });
        ctx.status = 'failed';
        ctx.failedStage = stageId;
        ctx.error = { message: e.message, code: e.code || 'PIP_STAGE_FAILED' };
        await this._saveRunState(runIdFinal, { ...ctx, completedStages: [...completed] });
        this._emit(PIPELINE_EVENTS.STAGE_FAILED, runIdFinal, { stage: stageId, error: e.message });
        this._emit(PIPELINE_EVENTS.PIPELINE_FAILED, runIdFinal, { stage: stageId, error: e.message });
        throw pipError(e.code || PIP_CODES.STAGE_FAILED, `stage "${stageId}" failed: ${e.message}`, { runId: ctx.runId, stage: stageId });
      }
    }

    ctx.status = 'ready';
    ctx.finishedAt = new Date().toISOString();
    await this._removeRunState(ctx.runId);
    this._emit(PIPELINE_EVENTS.PIPELINE_COMPLETED, runIdFinal, { businessId: ctx.businessId, configCount: ctx.configCount });
    return ctx;
  }

  _mergeCheckpoint(ctx, stageId, cp) {
    if (!cp || typeof cp !== 'object') return;
    const map = {
      validate: ['normalized'],
      normalize: ['normalized'],
      'generate-theme': ['themeTokens', 'defaultMode'],
      'generate-sections': ['sections'],
      'generate-assets-manifest': ['manifest'],
      'generate-config': ['configs', 'configCount', 'checksums', 'validation'],
      'generate-navigation': [],
      'generate-seo': [],
      'generate-structured-data': ['structuredData'],
      'generate-localization': [],
      'generate-build-package': ['validation', 'reportCount'],
      'qa-validation': ['qa', 'qaPassed', 'qaChecks'],
      'website-ready': ['status']
    };
    for (const k of map[stageId] || []) {
      if (cp[k] !== undefined) ctx[k] = cp[k];
    }
  }

  async _runStage(stageId, ctx, dossier) {
    switch (stageId) {
      case 'validate': {
        if (!dossier) throw pipError(PIP_CODES.INVALID_DOSSIER, 'dossier required');
        const n = normalizeDossier(dossier, { businessId: ctx.businessId });
        if (n.errors.length) {
          throw pipError(PIP_CODES.INVALID_DOSSIER, `dossier validation failed: ${n.errors.join('; ')}`);
        }
        ctx.businessId = n.normalized.id;
        ctx.name = n.normalized.name;
        ctx.category = n.normalized.category;
        ctx.normalized = n.normalized;
        ctx.validation.dossierValid = true;
        return { normalized: n.normalized };
      }
      case 'normalize': {
        const n = normalizeDossier(dossier, { businessId: ctx.businessId });
        ctx.normalized = n.normalized;
        ctx.businessId = n.normalized.id;
        ctx.name = n.normalized.name;
        ctx.category = n.normalized.category;
        return { normalized: n.normalized };
      }
      case 'generate-theme': {
        const { tokens, defaultMode } = generateThemeTokens(ctx.normalized);
        ctx.themeTokens = tokens;
        ctx.defaultMode = defaultMode;
        return { themeTokens: tokens, defaultMode };
      }
      case 'generate-sections': {
        const sections = planSections(ctx.normalized);
        ctx.sections = sections;
        return { sections };
      }
      case 'generate-assets-manifest': {
        const manifest = generateAssetsManifest(ctx.normalized);
        ctx.manifest = manifest;
        return { manifest };
      }
      case 'generate-config': {
        const configs = buildConfigs(ctx.normalized, {
          themeTokens: ctx.themeTokens,
          defaultMode: ctx.defaultMode,
          sections: ctx.sections,
          manifest: ctx.manifest
        });
        const perConfig = [];
        let allValid = true;
        for (const fileId of CONFIG_IDS) {
          const cfg = configs[fileId];
          if (!cfg) {
            allValid = false;
            perConfig.push({ fileId, valid: false, errors: ['not generated'] });
            continue;
          }
          let errors = [];
          let valid = true;
          if (this.validator && typeof this.validator.validate === 'function') {
            const schema = getConfigSchema(fileId);
            const res = this.validator.validate(cfg, schema, { schemaPath: schema.$id });
            valid = res.valid !== false;
            errors = (res.errors || []).map((e) => e.message || String(e));
          }
          perConfig.push({ fileId, valid, errors });
          if (!valid) allValid = false;
        }
        ctx.validation.perConfig = perConfig;
        ctx.validation.allValid = allValid;
        if (!allValid) {
          const bad = perConfig.filter((c) => !c.valid).map((c) => c.fileId);
          throw pipError(PIP_CODES.VALIDATION_FAILED, `invalid configs: ${bad.join(', ')}`);
        }
        ctx.configs = configs;
        ctx.configCount = Object.keys(configs).length;
        for (const [fileId, cfg] of Object.entries(configs)) {
          ctx.checksums[fileId] = createHash('sha256').update(stableJson(cfg)).digest('hex');
        }
        return { configs, configCount: ctx.configCount, checksums: ctx.checksums, validation: ctx.validation };
      }
      case 'generate-navigation': {
        return { detail: `${(ctx.configs['navigation.json']?.items || []).length} nav items` };
      }
      case 'generate-seo': {
        return { detail: `title: ${(ctx.configs['seo.json']?.title || '').slice(0, 40)}` };
      }
      case 'generate-structured-data': {
        const sd = generateStructuredData(ctx.normalized);
        ctx.structuredData = sd;
        return { structuredData: sd };
      }
      case 'generate-localization': {
        const i18n = generateLocalization(ctx.normalized, ctx.sections);
        ctx.i18n = i18n;
        return { i18n };
      }
      case 'generate-build-package': {
        if (!this.root) return { detail: 'no root — package skipped (dry run)' };
        const out = await this._assemblePackage(ctx);
        ctx.outputRoot = out.outputRoot;
        ctx.reportCount = out.reportCount;
        return { outputRoot: out.outputRoot, reportCount: out.reportCount, validation: ctx.validation };
      }
      case 'qa-validation': {
        const qa = runQA({
          configs: ctx.configs,
          themeTokens: ctx.themeTokens,
          sections: ctx.sections,
          manifest: ctx.manifest,
          structuredData: ctx.structuredData,
          validation: ctx.validation,
          logger: this.logger
        });
        ctx.qa = qa;
        ctx.qaPassed = qa.passed;
        ctx.qaChecks = qa.checkCount;
        this._emit(PIPELINE_EVENTS.QA_COMPLETED, ctx.runId, { passed: qa.passed, checks: qa.checkCount });
        if (!qa.passed) {
          const failed = qa.failedChecks.map((c) => c.name).join(', ');
          await this._writeReports(ctx);
          throw pipError(PIP_CODES.QA_FAILED, `QA failed: ${failed}`, { checks: failed });
        }
        return { qa, qaPassed: qa.passed, qaChecks: qa.checkCount };
      }
      case 'website-ready': {
        ctx.reportCount = await this._writeReports(ctx);
        ctx.configCount = ctx.configCount || Object.keys(ctx.configs).length;
        return { status: 'ready', reportCount: ctx.reportCount, detail: `website-ready: ${ctx.configCount} configs, QA passed` };
      }
      default:
        throw pipError(PIP_CODES.UNKNOWN_STAGE, `unknown stage "${stageId}"`);
    }
  }

  async _assemblePackage(ctx) {
    const outputRoot = path.join(this.root, 'build');
    const configDir = path.join(outputRoot, 'website-config');
    const reportsDir = path.join(outputRoot, 'reports');
    const logsDir = path.join(outputRoot, 'logs');
    const artifactsDir = path.join(outputRoot, 'artifacts');
    await mkdir(configDir, { recursive: true });
    await mkdir(reportsDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });
    await mkdir(artifactsDir, { recursive: true });

    const configBytes = {};
    for (const fileId of Object.keys(ctx.configs).sort()) {
      const json = stableJson(ctx.configs[fileId]);
      await writeFile(path.join(configDir, fileId), json, 'utf8');
      configBytes[fileId] = Buffer.byteLength(json);
    }

    const summary = {
      runId: ctx.runId,
      businessId: ctx.businessId,
      name: ctx.name,
      category: ctx.category,
      pipelineId: ctx.pipelineId,
      status: 'ready',
      version: '1',
      configFiles: Object.keys(ctx.configs).length,
      configBytes,
      checksums: ctx.checksums,
      sections: ctx.sections?.enabledIds || [],
      qa: { passed: ctx.qaPassed, checks: ctx.qaChecks }
    };
    await writeFile(path.join(artifactsDir, 'summary.json'), stableJson(summary), 'utf8');
    await writeFile(path.join(artifactsDir, 'manifest.json'), stableJson(ctx.manifest), 'utf8');
    await writeFile(path.join(artifactsDir, 'structured-data.json'), stableJson(ctx.structuredData), 'utf8');
    await writeFile(path.join(artifactsDir, 'sections.json'), stableJson(ctx.sections), 'utf8');

    const reportCount = await this._writeReports(ctx, reportsDir);

    const runLog = ctx.stages.map((s) => `[${s.id}] ok=${s.ok} ${s.durationMs}ms ${s.detail || ''}`.trim()).join('\n');
    await writeFile(path.join(logsDir, 'run.log'), runLog + '\n', 'utf8');

    await writeFile(path.join(outputRoot, 'summary.json'), stableJson(summary), 'utf8');
    return { outputRoot, reportCount };
  }

  async _writeReports(ctx, dir = null) {
    const reports = buildReports(ctx);
    const target = dir || (this.root ? path.join(this.root, 'build', 'reports') : null);
    if (!target) return Object.keys(reports).length;
    await mkdir(target, { recursive: true });
    for (const [name, content] of Object.entries(reports)) {
      await writeFile(path.join(target, name), content, 'utf8');
    }
    return Object.keys(reports).length;
  }
}

export function createPipelineRunner(opts = {}) {
  return new PipelineRunner(opts);
}
