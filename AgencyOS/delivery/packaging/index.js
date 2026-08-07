import fs from 'node:fs';
import path from 'node:path';
import { sha256, ensureDir, writeJson, readJson, exists, listSorted, isDir } from '../utils.js';
import { writeZip } from './zip.js';
import { deliveryError, DEL_CODES } from '../errors.js';

export class PackagingManager {
  constructor({ root, logger = null, keep = 5 } = {}) {
    this.root = root;
    this.logger = logger;
    this.keep = keep;
    this.packagesDir = path.join(root, 'storage', 'delivery', 'packages');
  }

  packageDir(packageId) {
    return path.join(this.packagesDir, packageId);
  }

  bundlePath(packageId) {
    return path.join(this.packageDir(packageId), 'bundle.zip');
  }

  manifestPath(packageId) {
    return path.join(this.packageDir(packageId), 'package-manifest.json');
  }

  hasPackage(packageId) {
    return exists(this.bundlePath(packageId)) && exists(this.manifestPath(packageId));
  }

  loadManifest(packageId) {
    if (!this.hasPackage(packageId)) {
      throw deliveryError(DEL_CODES.PACKAGE_MISSING, `no package "${packageId}"`, { packageId });
    }
    return readJson(this.manifestPath(packageId));
  }

  bundleSha256(packageId) {
    return sha256(fs.readFileSync(this.bundlePath(packageId)));
  }

  packageBuild({ buildId, buildRecord, qaReport, tree }) {
    if (this.hasPackage(buildId)) {
      this.logger?.info?.(`delivery package: reuse immutable package ${buildId}`);
      return { packageId: buildId, manifest: this.loadManifest(buildId), reused: true };
    }

    const bundle = writeZip(tree);
    const manifest = {
      schema: 'https://agency.os/delivery/package-manifest',
      packageId: buildId,
      businessId: buildRecord.businessId,
      trace: {
        dossierVersion: buildRecord.trace.dossierVersion,
        pipelineRunId: buildRecord.trace.pipelineRunId,
        engineOutputChecksum: buildRecord.engineOutputChecksum
      },
      bundle: {
        format: 'zip',
        bytes: bundle.length,
        sha256: sha256(bundle),
        fileCount: Object.keys(tree).length
      },
      files: buildRecord.files,
      qaReportId: qaReport ? `qa-${buildId}` : null,
      qaPassed: qaReport ? qaReport.passed : false
    };

    const dir = ensureDir(this.packageDir(buildId));
    fs.writeFileSync(path.join(dir, 'bundle.zip'), bundle);
    writeJson(this.manifestPath(buildId), manifest);
    this.logger?.info?.(`delivery package: ${buildId} (${bundle.length} bytes)`);
    return { packageId: buildId, manifest, reused: false };
  }

  packageTree(packageId) {
    const dir = path.join(this.packageDir(packageId), 'tree');
    if (!isDir(dir)) return null;
    const files = {};
    const walk = (rel) => {
      for (const entry of listSorted(path.join(dir, rel))) {
        const full = path.join(dir, rel, entry);
        if (fs.statSync(full).isDirectory()) walk(path.join(rel, entry));
        else files[path.join(rel, entry).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
      }
    };
    walk('.');
    return files;
  }

  prune({ livePackageIds = [] } = {}) {
    const entries = listSorted(this.packagesDir)
      .filter((id) => isDir(path.join(this.packagesDir, id)))
      .sort();
    const keepSet = new Set(livePackageIds);
    const removable = entries.filter((id) => !keepSet.has(id));
    let removed = 0;
    for (const id of removable) {
      if (entries.length - removed <= this.keep) break;
      fs.rmSync(path.join(this.packagesDir, id), { recursive: true, force: true });
      removed++;
    }
    return { removed, kept: entries.length - removed };
  }

  listForBusiness(businessId) {
    const out = [];
    for (const id of listSorted(this.packagesDir)) {
      const mPath = this.manifestPath(id);
      if (!exists(mPath)) continue;
      const manifest = readJson(mPath);
      if (manifest.businessId === businessId) out.push(manifest);
    }
    return out;
  }
}
