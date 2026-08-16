import path from 'node:path';
import { dosError, DOS_CODES } from './errors.js';
import { ensureDir, writeJson, readJson, atomicWrite, nowIso, shortHash, stableStringify } from '../runtime/utils.js';
import { runExtractors } from './extractors/index.js';
import { runEnrichers } from './enrichers/run.js';
import { categoryInfo, priceLevelInfo } from './categories.js';
import { buildReadme, buildBusiness, buildBrand, buildContact, buildLocation, buildHours, buildSocial, buildWebsite, buildSeo, buildReviews, buildPhotos, buildServices, buildProducts, buildPricing, buildCompetitors, buildStrengths, buildWeaknesses, buildOpportunities, buildRisks, buildRecommendations, buildSummary } from './builders/index.js';
import { getSchema, validateDocuments, listSchemaIds } from './schemas/index.js';
import { buildReports } from './reports/index.js';
import { ContextEngine } from '../context/index.js';
import { DecisionEngine } from '../decision-engine/index.js';
import { createValidator } from '../runtime/validator.js';
import { scanFiles } from '../delivery/security/scan.js';

export const DOSSIER_EVENTS = {
  DOSSIER_STARTED: 'dossier.started',
  DOSSIER_VALIDATED: 'dossier.validated',
  DOSSIER_CREATED: 'dossier.created',
  DOSSIER_UPDATED: 'dossier.updated',
  DOSSIER_REPORTS_READY: 'dossier.reports_ready',
  SECRET_SCAN_FAILED: 'dossier.secret_scan_failed'
};

export class DossierEngine {
  constructor({ root = null, validator = null, bus = null, memory = null, brain = null, logger = null } = {}) {
    this.root = root ? path.resolve(root) : null;
    this.validator = validator || createValidator();
    this.bus = bus || null;
    this.memory = memory || null;
    this.brain = brain || null;
    this.logger = logger || null;
    this.contextEngine = new ContextEngine();
    this.decisionEngine = new DecisionEngine();
    this.stats = { built: 0, updated: 0, validated: 0 };
  }

  _emit(event, businessId, detail) {
    if (this.bus && typeof this.bus.emitEvent === 'function') {
      this.bus.emitEvent(event, { module: 'dossier', businessId }, detail);
    }
  }

  _dossierRoot(businessId) {
    return this.root ? path.join(this.root, 'storage', 'dossiers', businessId) : null;
  }

  _indexFile() {
    return this.root ? path.join(this.root, 'storage', 'dossiers', 'index.json') : null;
  }

  _loadIndex() {
    return this.root ? readJson(this._indexFile(), []) : [];
  }

  _saveIndex(index) {
    if (this.root) atomicWrite(this._indexFile(), JSON.stringify(index, null, 2));
  }

  async prepareInput(input, opts = {}) {
    if (!input) throw dosError(DOS_CODES.INVALID_INPUT, 'dossier requires a business record or brain run result');
    if (input.context && input.decision) return input;
    if (this.brain) return this.brain.runBusiness(input, { emit: false });
    const context = this.contextEngine.build(input);
    context.estimates = this.decisionEngine.estimate(context);
    const decision = this.decisionEngine.evaluate(context, { policies: opts.policies || null });
    return { businessId: input.id, record: input, context, decision, trace: null, policy: null };
  }

  async build(input, { version = 1, update = false, policies = null, persist = true, requireApproved = false } = {}) {
    const run = await this.prepareInput(input, { policies });
    const businessId = run.businessId || (run.record && run.record.id);
    if (!businessId) throw dosError(DOS_CODES.INVALID_INPUT, 'business id required');
    const record = run.record || {};
    const context = run.context;
    const decision = run.decision;
    if (requireApproved && decision && decision.verdict !== 'APPROVE') {
      throw dosError(DOS_CODES.INVALID_INPUT, `dossier requires an APPROVED business (got ${decision.verdict})`);
    }
    this._emit(DOSSIER_EVENTS.DOSSIER_STARTED, businessId, { version });

    const raw = runExtractors(record);
    const profile = raw.profile;
    const digital = raw.digital;
    const commerce = raw.commerce;
    const enr = runEnrichers({ record, profile, digital, commerce, context, decision });
    const grades = enr.grades;

    if (update && persist) {
      const latest = this.latestVersion(businessId);
      version = latest ? latest + 1 : 1;
    }

    const now = nowIso();
    const meta = { dossierId: `dos-${shortHash(businessId, 10)}`, businessId, version, createdAt: now };
    const ctx = {
      meta, profile, digital, commerce, context, decision, enr, grades, raw,
      categoryInfo: categoryInfo(profile.category), priceLevelInfo: priceLevelInfo(profile.category)
    };

    const documents = {
      business: buildBusiness(ctx),
      brand: buildBrand(ctx),
      contact: buildContact(ctx),
      location: buildLocation(ctx),
      hours: buildHours(ctx),
      social: buildSocial(ctx),
      website: buildWebsite(ctx),
      seo: buildSeo(ctx),
      reviews: buildReviews(ctx),
      photos: buildPhotos(ctx),
      services: buildServices(ctx),
      products: buildProducts(ctx),
      pricing: buildPricing(ctx),
      competitors: buildCompetitors(ctx),
      strengths: buildStrengths(ctx),
      weaknesses: buildWeaknesses(ctx),
      opportunities: buildOpportunities(ctx),
      risks: buildRisks(ctx),
      recommendations: buildRecommendations(ctx),
      summary: buildSummary(ctx)
    };
    const readme = buildReadme(ctx);

    // Early secret scan: shift left from Final QA only (P1-1). Documents are
    // structured objects, so scan their deterministic serialization.
    const secretScan = scanFiles(Object.fromEntries(Object.entries(documents).map(([id, doc]) => [id, typeof doc === 'string' ? doc : stableStringify(doc)])));
    if (secretScan.length > 0) {
      this._emit(DOSSIER_EVENTS.SECRET_SCAN_FAILED, businessId, { matches: secretScan });
      throw dosError(DOS_CODES.SECRET_SCAN_FAILED, `dossier secret scan failed: ${secretScan.length} file(s) contain potential secrets`);
    }

    const validation = validateDocuments(documents, this.validator);
    if (!validation.valid) {
      throw dosError(DOS_CODES.INVALID_DOSSIER, `dossier validation failed: ${JSON.stringify(validation.errors).slice(0, 400)}`);
    }
    this.stats.validated++;
    this._emit(DOSSIER_EVENTS.DOSSIER_VALIDATED, businessId, { version, documents: Object.keys(documents).length });

    const reports = buildReports({ businessId, version, documents, trace: run.trace });
    this._emit(DOSSIER_EVENTS.DOSSIER_REPORTS_READY, businessId, { version, reports: Object.keys(reports).length });

    const dossier = {
      dossierId: meta.dossierId, businessId, version,
      businessName: profile.name, category: profile.category, area: profile.area,
      verdict: decision ? decision.verdict : null,
      healthGrade: grades.healthGrade, digitalGrade: grades.digitalGrade, opportunity: grades.opportunity,
      createdAt: now, updatedAt: now,
      documents, readme, reports,
      validation: { valid: true, errors: [] }
    };

    if (persist) await this._persist(dossier, update);
    this.stats.built++;
    if (update) this.stats.updated++;
    this._emit(update ? DOSSIER_EVENTS.DOSSIER_UPDATED : DOSSIER_EVENTS.DOSSIER_CREATED, businessId, { version });

    if (this.memory && typeof this.memory.put === 'function') {
      try {
        this.memory.put('business', `business:${businessId}`, businessId, { dossierId: dossier.dossierId, version, name: profile.name, category: profile.category, healthGrade: grades.healthGrade, verdict: dossier.verdict }, { by: 'dossier' });
      } catch (e) {
        if (this.logger) this.logger.warn('dossier memory put failed', e.message);
      }
    }
    return dossier;
  }

  async _persist(dossier, update) {
    if (!this.root) return;
    const dir = this._dossierRoot(dossier.businessId);
    const versionDir = path.join(dir, `v${dossier.version}`);
    ensureDir(versionDir);
    for (const [docId, doc] of Object.entries(dossier.documents)) {
      writeJson(path.join(versionDir, `${docId}.json`), doc);
    }
    writeJson(path.join(versionDir, 'README.md'), dossier.readme);
    const reportsDir = path.join(versionDir, 'reports');
    ensureDir(reportsDir);
    for (const [reportId, content] of Object.entries(dossier.reports)) {
      writeJson(path.join(reportsDir, `${reportId}.md`), content);
    }
    writeJson(path.join(dir, 'latest.json'), { businessId: dossier.businessId, version: dossier.version, updatedAt: dossier.updatedAt });
    const index = this._loadIndex();
    const existing = index.find((x) => x.businessId === dossier.businessId);
    const entry = { businessId: dossier.businessId, name: dossier.businessName, category: dossier.category, area: dossier.area, verdict: dossier.verdict, healthGrade: dossier.healthGrade, opportunity: dossier.opportunity, version: dossier.version, updatedAt: dossier.updatedAt };
    if (existing) Object.assign(existing, entry);
    else index.push(entry);
    this._saveIndex(index);
  }

  latestVersion(businessId) {
    if (!this.root) return null;
    const latest = readJson(path.join(this._dossierRoot(businessId), 'latest.json'), null);
    return latest ? latest.version : null;
  }

  load(businessId, { version = null } = {}) {
    if (!this.root) return null;
    const latest = this.latestVersion(businessId);
    if (!latest) return null;
    const v = version || latest;
    const dir = path.join(this._dossierRoot(businessId), `v${v}`);
    const files = ['business', 'brand', 'contact', 'location', 'hours', 'social', 'website', 'seo', 'reviews', 'photos', 'services', 'products', 'pricing', 'competitors', 'strengths', 'weaknesses', 'opportunities', 'risks', 'recommendations', 'summary'];
    const documents = {};
    for (const f of files) {
      documents[f] = readJson(path.join(dir, `${f}.json`), null);
    }
    return { dossierId: documents.business ? documents.business.dossierId : null, businessId, version: v, documents };
  }

  search({ category = null, area = null, verdict = null, minOpportunity = null, q = null, healthGrade = null } = {}) {
    const index = this._loadIndex();
    return index.filter((e) => {
      if (category && e.category !== category) return false;
      if (area && e.area !== area) return false;
      if (verdict && e.verdict !== verdict) return false;
      if (healthGrade && e.healthGrade !== healthGrade) return false;
      if (minOpportunity != null && (e.opportunity || 0) < minOpportunity) return false;
      if (q && !e.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }

  validateDossier(dossier) {
    return validateDocuments(dossier.documents, this.validator);
  }

  getSchema(documentId) {
    return getSchema(documentId);
  }

  snapshot() {
    return { ...this.stats, indexCount: this._loadIndex().length, schemas: listSchemaIds().length };
  }
}

export function createDossierEngine(opts) {
  return new DossierEngine(opts);
}
