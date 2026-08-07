import { createDeliverySystem } from '../index.js';
import { cleanSite, scratchRoot, buildRecordFor, assert, runTests } from './helpers.mjs';
import { sha256 } from '../utils.js';

const root = scratchRoot('qa');
const system = createDeliverySystem({ root });

function runQa(files, site, buildRecord, validation) {
  return system.qa.run({ buildId: buildRecord.buildId, site, validation, buildRecord, files });
}

function withValidation(fixture) {
  return { ...fixture, validation: { ...fixture.validation } };
}

function baseFixture(businessId = 'qa-biz-001') {
  return withValidation(cleanSite(businessId));
}

function baseRecord(fixture, buildId = '0123456789abcdef') {
  return buildRecordFor({ buildId, businessId: fixture.site.businessId, files: fixture.files, trace: fixture.trace, checksum: 'f'.repeat(16) });
}

function defect(businessId, mutate) {
  const fixture = baseFixture(businessId);
  mutate(fixture);
  return fixture;
}

function expectGroupFail(report, groupId, label) {
  assert(!report.passed, `${label}: overall FAIL`);
  const group = report.groups.find((g) => g.id === groupId);
  assert(group && !group.passed, `${label}: group ${groupId} failed`);
}

function htmlWith(overrides = {}, extra = '') {
  const o = {
    title: '<title>ok</title>',
    description: '<meta name="description" content="desc">',
    h1: '<h1>one</h1>',
    canonical: '<link rel="canonical" href="https://agency.test/index.html">',
    ldjson: '<script type="application/ld+json">{"@type":"LocalBusiness"}</script>',
    img: '<img src="img/hero.jpg" alt="hero">',
    landmarks: '<header><nav><a href="index.html">h</a></nav></header><main><h2 id="c">c</h2><a href="#c">go</a></main><footer>f</footer>',
    ...overrides
  };
  return `<!doctype html><html><head><meta charset="utf-8">${o.title}${o.description}${o.canonical}${o.ldjson}</head><body>${o.landmarks}${o.h1}${o.img}${extra}</body></html>`;
}

const tests = [
  ['clean fixture passes every QA group', () => {
    const fixture = baseFixture();
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    assert(report.passed, 'clean site passes');
    for (const g of report.groups) assert(g.passed, `group ${g.id} passed`);
  }],
  ['engine gate fails when validation report is missing', () => {
    const fixture = baseFixture();
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), null);
    expectGroupFail(report, 'engine', 'missing validation');
  }],
  ['seo gate: missing title', () => {
    const fixture = defect('qa-seo-title', (f) => {
      f.files['index.html'] = htmlWith({ title: '' });
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'seo', 'no title');
  }],
  ['seo gate: two h1', () => {
    const fixture = defect('qa-seo-h1', (f) => {
      f.files['index.html'] = htmlWith({ h1: '<h1>one</h1><h1>two</h1>' });
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'seo', 'two h1');
  }],
  ['seo gate: invalid ld+json', () => {
    const fixture = defect('qa-seo-ld', (f) => {
      f.files['index.html'] = htmlWith({ ldjson: '<script type="application/ld+json">{not json</script>' });
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'seo', 'bad ldjson');
  }],
  ['seo gate: sitemap missing a page', () => {
    const fixture = defect('qa-seo-map', (f) => {
      f.files['sitemap.xml'] = f.files['sitemap.xml'].replace(/about.html/g, '');
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'seo', 'coverage');
  }],
  ['a11y gate: low contrast fails', () => {
    const fixture = defect('qa-a11y-contrast', (f) => {
      f.site.theme = { colors: { light: { ink: '#aaaaaa', base: '#ffffff' } } };
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'a11y', 'contrast');
  }],
  ['a11y gate: img without alt', () => {
    const fixture = defect('qa-a11y-alt', (f) => {
      f.files['index.html'] = htmlWith({ img: '<img src="img/hero.jpg">' });
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'a11y', 'alt');
  }],
  ['a11y gate: missing landmark', () => {
    const fixture = defect('qa-a11y-land', (f) => {
      f.files['index.html'] = htmlWith({ landmarks: '<header><nav><a href="index.html">h</a></nav></header><main><h2 id="c">c</h2><a href="#c">go</a></main>' });
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'a11y', 'landmark');
  }],
  ['links gate: dead internal target', () => {
    const fixture = defect('qa-links-dead', (f) => {
      f.files['index.html'] = htmlWith({}, '<a href="missing.html">dead</a>');
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'links', 'dead link');
  }],
  ['links gate: unsupported scheme', () => {
    const fixture = defect('qa-links-scheme', (f) => {
      f.files['index.html'] = htmlWith({}, '<a href="ftp://files.example/x">ftp</a>');
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'links', 'ftp scheme');
  }],
  ['links gate: unresolved anchor', () => {
    const fixture = defect('qa-links-anchor', (f) => {
      f.files['index.html'] = htmlWith({}, '<a href="#nope">gone</a>');
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'links', 'anchor');
  }],
  ['assets gate: referenced asset missing', () => {
    const fixture = defect('qa-assets-missing', (f) => {
      f.files['index.html'] = htmlWith({ img: '<img src="img/hero.jpg" alt="hero"><img src="img/gone.jpg" alt="gone">' });
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'assets', 'missing asset');
  }],
  ['assets gate: checksum mismatch with build record', () => {
    const fixture = baseFixture('qa-assets-cksum');
    const record = baseRecord(fixture);
    record.files = record.files.map((f) => (f.path === 'index.html' ? { ...f, sha256: '0'.repeat(64) } : f));
    const report = runQa(fixture.files, fixture.site, record, fixture.validation);
    expectGroupFail(report, 'assets', 'checksum mismatch');
  }],
  ['secrets gate: token in generated file fails QA', () => {
    const fixture = defect('qa-secrets', (f) => {
      f.files['config.js'] = 'window.apiKey = "sk-abcdef1234567890"';
    });
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'secrets', 'secret found');
  }],
  ['engine gate: per-page failures surfaced', () => {
    const fixture = withValidation(cleanSite('qa-engine-page'));
    fixture.validation.pages = [{ id: 'home', ok: false, checks: [{ id: 'x', ok: false, errors: ['bad'] }] }];
    const report = runQa(fixture.files, fixture.site, baseRecord(fixture), fixture.validation);
    expectGroupFail(report, 'engine', 'page failure');
  }],
  ['checksum of fixture matches build record path values', () => {
    const fixture = baseFixture();
    const record = baseRecord(fixture);
    for (const f of record.files) {
      assert(sha256(fixture.files[f.path]) === f.sha256, `record checksum ${f.path}`);
    }
  }]
];

await runTests('delivery/qa', tests);
