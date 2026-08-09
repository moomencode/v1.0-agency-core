import fs from 'node:fs';
import path from 'node:path';
import { sha256, buildIdFrom, computeEngineChecksum, posixPath, ensureDir, writeJson, readJson, exists } from '../utils.js';
import { assembleProductionTree } from './assemble.js';
import { checkBudget } from './budget.js';
import { deliveryError, DEL_CODES } from '../errors.js';

export class ProductionBuildManager {
  constructor({ root, engine = null, budgets = null, logger = null } = {}) {
    this.root = root;
    this.engine = engine;
    this.budgets = budgets;
    this.logger = logger;
    this.buildsDir = path.join(root, 'storage', 'delivery', 'builds');
  }

  buildDir(buildId) {
    return path.join(this.buildsDir, buildId);
  }

  buildRecordPath(buildId) {
    return path.join(this.buildDir(buildId), 'build-record.json');
  }

  hasBuild(buildId) {
    return exists(this.buildRecordPath(buildId));
  }

  loadBuild(buildId) {
    if (!this.hasBuild(buildId)) {
      throw deliveryError(DEL_CODES.UNKNOWN_BUILD, `no build "${buildId}"`, { buildId });
    }
    return readJson(this.buildRecordPath(buildId));
  }

  async build(businessId, { site, validation = null, trace = {}, engineOutputChecksum = null } = {}) {
    if (!site) throw deliveryError(DEL_CODES.INVALID_TRACE, 'build requires a website site object');
    if (!businessId || !trace.dossierVersion || !trace.pipelineRunId) {
      throw deliveryError(DEL_CODES.INVALID_TRACE, 'build trace must include businessId, dossierVersion, pipelineRunId');
    }

    const files = this.engine ? this.engine.export(site, { format: 'static' }) : null;
    if (!files || typeof files !== 'object') {
      throw deliveryError(DEL_CODES.INVALID_TRACE, 'engine static export produced no files');
    }

    const engineChecksum = engineOutputChecksum || computeEngineChecksum(site, files);
    const buildId = buildIdFrom(trace, engineChecksum);

    if (this.hasBuild(buildId)) {
      this.logger?.info?.(`delivery build: reuse deterministic build ${buildId}`, { businessId });
      return { buildId, record: this.loadBuild(buildId), reused: true };
    }

    const tree = assembleProductionTree(site, files);
    const fileEntries = Object.keys(tree)
      .sort()
      .map((rel) => {
        const content = tree[rel];
        return {
          path: posixPath(rel),
          sha256: sha256(content),
          bytes: Buffer.byteLength(content, 'utf8')
        };
      });

    const budget = checkBudget(tree, this.budgets || undefined);
    const record = {
      schema: 'https://agency.os/delivery/build-record',
      buildId,
      businessId,
      engineVersion: site.engineVersion || 'unknown',
      trace: {
        businessId,
        dossierVersion: Number(trace.dossierVersion) || 0,
        pipelineRunId: String(trace.pipelineRunId)
      },
      engineOutputChecksum: engineChecksum,
      files: fileEntries,
      fileCount: fileEntries.length,
      budget,
      createdAt: new Date().toISOString()
    };

    const dir = ensureDir(path.join(this.buildDir(buildId), 'production'));
    for (const rel of Object.keys(tree)) {
      const target = path.join(dir, rel);
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, tree[rel]);
    }
    writeJson(this.buildRecordPath(buildId), record);
    this.logger?.info?.(`delivery build: ${buildId} (${record.fileCount} files, ${budget.totalBytes} bytes)`, { businessId });
    return { buildId, record, reused: false };
  }

  buildTree(buildId) {
    return path.join(this.buildDir(buildId), 'production');
  }

  readTree(buildId) {
    const dir = this.buildTree(buildId);
    if (!fs.existsSync(dir)) return null;
    const files = {};
    const walk = (rel) => {
      for (const entry of fs.readdirSync(path.join(dir, rel)).sort()) {
        const full = path.join(dir, rel, entry);
        if (fs.statSync(full).isDirectory()) walk(path.join(rel, entry));
        else files[path.join(rel, entry).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
      }
    };
    walk('.');
    return files;
  }
}
