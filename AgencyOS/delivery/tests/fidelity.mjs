import { createDeliverySystem } from '../index.js';
import { cleanSite, scratchRoot, buildRecordFor, fakeEngine, assert, runTests } from './helpers.mjs';

const filesByBusiness = new Map();
const engine = fakeEngine((site) => filesByBusiness.get(site.businessId));
const root = scratchRoot('fidelity');
const system = createDeliverySystem({ root, engine });

const tests = [
  ['clean QA report is truthful: ok checks never carry errors', () => {
    const fixture = cleanSite('fid-clean-001');
    const record = buildRecordFor({ buildId: 'aaaaaaaaaaaaaaa1', businessId: fixture.site.businessId, files: fixture.files, trace: fixture.trace, checksum: '0'.repeat(16) });
    const report = system.qa.run({ buildId: record.buildId, site: fixture.site, validation: fixture.validation, buildRecord: record, files: fixture.files });
    assert(report.passed, 'clean site passes');
    for (const group of report.groups) {
      assert(group.passed, `group ${group.id} passed`);
      for (const c of group.checks) {
        assert(c.ok === (c.errors.length === 0), `check ${c.id}: ok=${c.ok} conflicts with errors=${c.errors.length}`);
      }
    }
    assert(report.groups.some((g) => g.id === 'fidelity'), 'fidelity content group present in FinalQA');
  }],
  ['defect in final artifact is detected with truthful error text', () => {
    const fixture = cleanSite('fid-defect-001');
    const record = buildRecordFor({ buildId: 'bbbbbbbbbbbbbbbb', businessId: fixture.site.businessId, files: fixture.files, trace: fixture.trace, checksum: '1'.repeat(16) });
    fixture.files['index.html'] = fixture.files['index.html'].replace(/<title>[\s\S]*?<\/title>/i, '');
    const report = system.qa.run({ buildId: record.buildId, site: fixture.site, validation: fixture.validation, buildRecord: record, files: fixture.files });
    assert(!report.passed, 'tampered artifact fails QA');
    const titleCheck = report.groups.flatMap((g) => g.checks).find((c) => c.id === 'seo:title:index.html');
    assert(titleCheck && !titleCheck.ok, 'seo:title check failed');
    assert(titleCheck.errors.some((e) => e.includes('title')), 'failure carries a truthful error message');
    for (const group of report.groups) {
      for (const c of group.checks) {
        assert(c.ok === (c.errors.length === 0), `check ${c.id}: ok=${c.ok} conflicts with errors=${c.errors.length}`);
      }
    }
  }],
  ['content-fidelity gate blocks literal placeholders in delivered pages', () => {
    const fixture = cleanSite('fid-placeholder-001');
    const record = buildRecordFor({ buildId: 'cccccccccccccccc', businessId: fixture.site.businessId, files: fixture.files, trace: fixture.trace, checksum: '2'.repeat(16) });
    fixture.files['index.html'] = fixture.files['index.html'].replace('<h1>', '<h1>{rating} ');
    const report = system.qa.run({ buildId: record.buildId, site: fixture.site, validation: fixture.validation, buildRecord: record, files: fixture.files });
    assert(!report.passed, 'placeholder leak fails QA');
    const check = report.groups.flatMap((g) => g.checks).find((c) => c.id === 'fidelity:placeholder:index.html');
    assert(check && !check.ok, 'fidelity:placeholder check failed');
    assert(check.errors.some((e) => e.includes('{rating}')), 'error names the leaked placeholder');
  }],
  ['same-artifact loop: build, deliver, tamper, re-verify catches it end-to-end', async () => {
    const fixture = cleanSite('fid-loop-001', { version: 1 });
    filesByBusiness.set(fixture.site.businessId, fixture.files);
    const result = await system.builds.build(fixture.site.businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
    const tree = system.builds.readTree(result.buildId);
    const qa1 = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
    assert(qa1.passed, 'first pass: delivered artifact tree is clean');
    const tampered = { ...tree, 'index.html': tree['index.html'].replace(/<title>[\s\S]*?<\/title>/i, '') };
    const qa2 = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tampered });
    assert(!qa2.passed, 'tampered artifact tree fails FinalQA');
    const titleCheck = qa2.groups.flatMap((g) => g.checks).find((c) => c.id === 'seo:title:index.html');
    assert(titleCheck && !titleCheck.ok && titleCheck.errors.length > 0, 're-verify catches the injected defect with evidence');
  }]
];

runTests('delivery/fidelity', tests);