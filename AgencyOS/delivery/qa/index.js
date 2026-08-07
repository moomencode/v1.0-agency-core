import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeJson, readJson, exists } from '../utils.js';
import { runEngineGroup } from './engine.js';
import { runSeoGroup } from './seo.js';
import { runA11yGroup } from './a11y.js';
import { runLinksGroup } from './links.js';
import { runAssetsGroup } from './assets.js';
import { runSecretScanGroup } from './secret-scan.js';

export class FinalQA {
  constructor({ root, logger = null } = {}) {
    this.root = root;
    this.logger = logger;
    this.qaDir = path.join(root, 'storage', 'delivery', 'qa');
  }

  qaPath(buildId) {
    return path.join(this.qaDir, buildId, 'qa-report.json');
  }

  hasReport(buildId) {
    return exists(this.qaPath(buildId));
  }

  loadReport(buildId) {
    if (!this.hasReport(buildId)) return null;
    return readJson(this.qaPath(buildId));
  }

  run({ buildId, site, validation, buildRecord, files }) {
    const groups = [
      runEngineGroup(site, validation),
      runSeoGroup(files),
      runA11yGroup(files, site),
      runLinksGroup(files),
      runAssetsGroup(files, buildRecord),
      runSecretScanGroup(files)
    ];
    const totals = groups.reduce(
      (acc, g) => {
        acc.checks += g.checks.length;
        acc.passed += g.checks.filter((c) => c.ok).length;
        acc.failed += g.checks.filter((c) => !c.ok).length;
        return acc;
      },
      { checks: 0, passed: 0, failed: 0 }
    );
    const report = {
      schema: 'https://agency.os/delivery/qa-report',
      buildId,
      businessId: buildRecord.businessId,
      groups,
      totals,
      passed: groups.every((g) => g.passed) && totals.failed === 0
    };
    ensureDir(path.dirname(this.qaPath(buildId)));
    writeJson(this.qaPath(buildId), report);
    this.logger?.info?.(`delivery qa: ${buildId} ${report.passed ? 'PASS' : 'FAIL'} (${totals.checks} checks, ${totals.failed} failed)`, { businessId: report.businessId });
    return report;
  }
}
