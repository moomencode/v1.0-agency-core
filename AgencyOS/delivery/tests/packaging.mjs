import fs from 'node:fs';
import { createDeliverySystem } from '../index.js';
import { writeZip, readZip } from '../packaging/zip.js';
import { sha256 } from '../utils.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const root = scratchRoot('packaging');
const filesByBusiness = new Map();
const fakeEngine = {
  export(site) {
    return filesByBusiness.get(site.businessId) || {};
  }
};
const system = createDeliverySystem({ root, engine: fakeEngine });

async function buildOnce(businessId = 'pkg-cafe-001', version = 1) {
  const fixture = cleanSite(businessId, { version });
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return { ...result, qa, files: tree };
}

const tests = [
  ['zip round-trip preserves every file byte-for-byte', () => {
    const files = { 'a.html': '<h1>a</h1>', 'css/site.css': '.x{}', 'img/p.png': 'PNG' };
    const buf = writeZip(files);
    const back = readZip(buf);
    assert(Object.keys(back).sort().join(',') === Object.keys(files).sort().join(','), 'same files');
    for (const [rel, content] of Object.entries(files)) {
      assert(back[rel] === content, `content ${rel}`);
    }
  }],
  ['zip output is byte-identical for identical input', () => {
    const files = { 'a.html': '<h1>a</h1>', 'b.txt': 'xyz' };
    const a = writeZip(files);
    const b = writeZip(files);
    assert(a.length === b.length && a.equals(b), 'identical bytes');
  }],
  ['zip order is deterministic regardless of insertion order', () => {
    const a = writeZip({ 'z.txt': '1', 'a.txt': '2' });
    const b = writeZip({ 'a.txt': '2', 'z.txt': '1' });
    assert(a.equals(b), 'sorted entries');
  }],
  ['zip crc verification rejects corruption', () => {
    const buf = writeZip({ 'f.txt': 'hello' });
    const corrupted = Buffer.from(buf);
    corrupted[35] ^= 0xff;
    const back = readZip(corrupted);
    assert(back['f.txt'] !== 'hello', 'corrupted entry dropped');
  }],
  ['packageBuild creates immutable bundle + manifest', async () => {
    const { buildId, files, qa } = await buildOnce();
    assert(qa.passed, 'qa passed before packaging');
    const manifest = system.packaging.loadManifest(buildId);
    assert(manifest.packageId === buildId, 'packageId = buildId');
    assert(manifest.businessId === 'pkg-cafe-001', 'businessId');
    assert(manifest.bundle.format === 'zip', 'zip format');
    assert(manifest.bundle.fileCount === Object.keys(files).length, 'fileCount matches');
    assert(manifest.qaPassed === true, 'qaPassed');
    assert(system.packaging.bundleSha256(buildId) === manifest.bundle.sha256, 'bundle sha stable');
    const fromZip = readZip(fs.readFileSync(system.packaging.bundlePath(buildId)));
    for (const f of manifest.files) {
      assert(sha256(fromZip[f.path]) === f.sha256, `manifest checksum ${f.path}`);
    }
  }],
  ['packageBuild reuses existing package (immutable)', async () => {
    const { buildId } = await buildOnce();
    const first = system.packaging.bundleSha256(buildId);
    const { manifest, reused } = system.packaging.packageBuild({ buildId, buildRecord: system.builds.loadBuild(buildId), qaReport: system.qa.loadReport(buildId), tree: cleanSite('pkg-cafe-001').files });
    assert(reused === true, 'reused');
    assert(manifest.bundle.sha256 === first, 'checksum unchanged');
  }],
  ['bundleSha256 throws E_DEL_PACKAGE_MISSING for unknown package', () => {
    let threw = false;
    try {
      system.packaging.loadManifest('deadbeefdeadbeef');
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_PACKAGE_MISSING', `code ${err.code}`);
    }
    assert(threw, 'threw');
  }],
  ['listForBusiness groups by business', async () => {
    await buildOnce('pkg-rest-001', 2);
    const cafe = system.packaging.listForBusiness('pkg-cafe-001');
    const rest = system.packaging.listForBusiness('pkg-rest-001');
    assert(cafe.length === 1 && cafe.every((m) => m.businessId === 'pkg-cafe-001'), 'cafe only');
    assert(rest.length === 1 && rest.every((m) => m.businessId === 'pkg-rest-001'), 'rest only');
  }],
  ['prune removes oldest packages but keeps live ones', async () => {
    const ids = [];
    for (let i = 0; i < 7; i++) {
      const fixture = cleanSite(`prune-biz-${i}`, { version: i + 1 });
      filesByBusiness.set(`prune-biz-${i}`, fixture.files);
      const result = await system.builds.build(`prune-biz-${i}`, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
      const tree = system.builds.readTree(result.buildId);
      const qa = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
      system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
      ids.push(result.buildId);
    }
    const { removed, kept } = system.packaging.prune({ livePackageIds: [ids[ids.length - 1]] });
    assert(removed >= 1, `removed ${removed}`);
    assert(system.packaging.hasPackage(ids[ids.length - 1]), 'live package kept');
    assert(kept <= 5, `kept ${kept} within budget`);
  }]
];

await runTests('delivery/packaging', tests);
