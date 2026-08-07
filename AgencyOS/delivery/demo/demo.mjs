import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../utils.js';
import { createDeliverySystem } from '../index.js';
import { MockProvider } from '../providers/mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'storage', 'delivery-demo');

console.log('AUTONOMOUS WEBSITE DELIVERY & DEPLOYMENT DEMO — Phase 4.4');
console.log('='.repeat(76));
console.log('Chain: Production Build -> Final QA -> Immutable Package -> Approval Gate -> Provider Deploy -> Record');
console.log(`Demo output: storage/delivery-demo/ (gitignored, local + mock providers only, zero network)\n`);

function page(title) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${title} description for seo">
<link rel="canonical" href="https://agency.test/index.html">
<script type="application/ld+json">{"@type":"LocalBusiness","name":"${title}"}</script>
</head>
<body>
<header><nav><a href="index.html">Home</a><a href="about.html">About</a></nav></header>
<main><h1>${title}</h1>
<img src="img/hero.jpg" alt="hero image">
<h2 id="contact">Contact</h2>
<a href="#contact">Contact link</a>
</main>
<footer>footer</footer>
</body>
</html>
`;
}

function siteFixture(businessId, version) {
  const site = {
    businessId,
    name: businessId,
    engineVersion: 'demo-engine-1.0',
    theme: { colors: { light: { ink: '#111111', base: '#ffffff' } } },
    pages: [
      { path: 'index.html', id: 'home', ok: true, checks: [] },
      { path: 'about.html', id: 'about', ok: true, checks: [] }
    ]
  };
  const files = {
    'index.html': page(`${businessId} home`),
    'about.html': page(`${businessId} about`),
    'img/hero.jpg': 'demo-jpeg-bytes',
    'assets/site.css': '.hero { background: url("img/hero.jpg"); }',
    'sitemap.xml': `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://agency.test/index.html</loc></url><url><loc>https://agency.test/about.html</loc></url></urlset>`,
    'robots.txt': 'User-agent: *\nAllow: /\n'
  };
  const validation = {
    passed: true,
    totals: { checks: 3, passed: 3, failed: 0 },
    pages: site.pages
  };
  return {
    site,
    files,
    validation,
    trace: { dossierVersion: version, pipelineRunId: `run-${businessId}-v${version}` }
  };
}

const filesByBusiness = new Map();
const engine = {
  export(site, { format = 'static' } = {}) {
    if (format !== 'static') throw new Error('demo engine only supports static export');
    return filesByBusiness.get(site.businessId) || {};
  }
};

const system = createDeliverySystem({ root: OUT, engine, autoAllowed: false });

async function buildAndQa(businessId, version) {
  const fixture = siteFixture(businessId, version);
  filesByBusiness.set(businessId, fixture.files);
  const result = await system.builds.build(businessId, { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qaReport = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport, tree });
  return { buildId: result.buildId, qaReport };
}

function summarize(record) {
  return `${record.status}${record.rollback?.buildId ? ` (rollback -> ${record.rollback.buildId.slice(0, 8)})` : ''}`;
}

// 1. dry-run: simulated, zero provider contact
{
  const { buildId } = await buildAndQa('demo-cafe-001', 1);
  const record = await system.deliver({ buildId, mode: 'dry-run', provider: 'local', target: { project: 'local-demo-cafe-001' } });
  console.log(`1. dry-run      demo-cafe-001 -> ${record.status} (simulated plan ready, provider untouched)`);
}

// 2. explicit approval -> real local deploy
{
  const { buildId } = await buildAndQa('demo-cafe-001', 2);
  const pending = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project: 'local-demo-cafe-001' } });
  console.log(`2. gate         demo-cafe-001 v2 -> ${pending.status} (waiting for approval)`);
  const approved = await system.approve(pending.id, { by: 'demo-operator' });
  const url = approved.deployment?.url?.replace(OUT, 'storage/delivery-demo') || '';
  console.log(`   deploy       ${summarize(approved)} -> ${url}`);
}

// 3. rejection terminates without deploying
{
  const { buildId } = await buildAndQa('demo-cafe-001', 3);
  const pending = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project: 'local-demo-cafe-001' } });
  await system.reject(pending.id, { by: 'demo-operator', note: 'design needs revision' });
  const after = system.getRecord(pending.id);
  console.log(`3. rejection    demo-cafe-001 v3 -> ${after.status} (no provider contact)`);
}

// 4. QA failure blocks record creation with zero provider contact
{
  const fixture = siteFixture('demo-qa-fail-001', 1);
  fixture.files['about.html'] = fixture.files['about.html'].replace('about.html', 'missing-page.html');
  filesByBusiness.set('demo-qa-fail-001', fixture.files);
  const result = await system.builds.build('demo-qa-fail-001', { site: fixture.site, validation: fixture.validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qaReport = system.qa.run({ buildId: result.buildId, site: fixture.site, validation: fixture.validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport, tree });
  let blocked = false;
  try {
    await system.deliver({ buildId: result.buildId, mode: 'explicit', provider: 'local' });
  } catch (err) {
    blocked = err.code === 'E_DEL_QA_FAILED';
  }
  console.log(`4. QA gate      demo-qa-fail-001 -> ${blocked ? 'blocked (E_DEL_QA_FAILED, broken internal link)' : 'UNEXPECTED: not blocked'}`);
}

// 5. transient provider failure -> retry succeeds
{
  const { buildId } = await buildAndQa('demo-retry-001', 1);
  const provider = new MockProvider({ project: 'demo-retry-001' }, { root: OUT });
  provider.queueFailure({ op: 'deploy', status: 500, retryable: true });
  system.registerProvider('demo-flaky', provider);
  const pending = await system.deliver({ buildId, mode: 'explicit', provider: 'demo-flaky' });
  const approved = await system.approve(pending.id, { by: 'demo-operator' });
  const retried = approved.timeline.some((t) => t.event === 'RETRY');
  console.log(`5. retry        demo-retry-001 -> ${approved.status} (${retried ? 'first attempt 500, retried, succeeded' : 'no retry recorded'})`);
}

// 6. auth failure -> never retried
{
  const { buildId } = await buildAndQa('demo-auth-001', 1);
  const provider = new MockProvider({ project: 'demo-auth-001' }, { root: OUT });
  provider.queueFailure({ op: 'deploy', status: 401, retryable: false, code: 'E_DEL_AUTH_FAILED' });
  system.registerProvider('demo-denied', provider);
  const pending = await system.deliver({ buildId, mode: 'explicit', provider: 'demo-denied' });
  let failed = null;
  try {
    await system.approve(pending.id, { by: 'demo-operator' });
  } catch (err) {
    failed = err;
  }
  const record = system.getRecord(pending.id);
  const noRetry = !record.timeline.some((t) => t.event === 'RETRY');
  console.log(`6. auth         demo-auth-001 -> ${record.status} (${failed?.code || '?'}, ${noRetry ? 'no blind retry' : 'UNEXPECTED retry'})`);
}

// 7. rollback promotes previous package, revert re-promotes
{
  const v1 = await (async () => {
    const { buildId } = await buildAndQa('demo-rollback-001', 1);
    const pending = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project: 'local-demo-rollback-001' } });
    return system.approve(pending.id, { by: 'demo-operator' });
  })();
  const v2 = await (async () => {
    const { buildId } = await buildAndQa('demo-rollback-001', 2);
    const pending = await system.deliver({ buildId, mode: 'explicit', provider: 'local', target: { project: 'local-demo-rollback-001' } });
    return system.approve(pending.id, { by: 'demo-operator' });
  })();
  await system.approveRollback(v2.id, { by: 'demo-ops' });
  const { original } = await system.rollback({ recordId: v2.id, mode: 'explicit', by: 'demo-operator' });
  const reverted = await system.revert({ recordId: v2.id, mode: 'explicit', by: 'demo-operator' });
  const alias = JSON.parse(fs.readFileSync(path.join(OUT, 'storage', 'delivery', 'local', 'local-demo-rollback-001', 'current.json'), 'utf8'));
  console.log(`7. rollback     v1 ${v1.trace.buildId.slice(0, 8)} / v2 ${v2.trace.buildId.slice(0, 8)} -> ${original.status} -> ${reverted.status} (alias now on ${alias.deploymentId.slice(0, 8)})`);
}

const records = system.history().length;
const audits = fs.existsSync(path.join(OUT, 'logs', 'delivery')) ? fs.readdirSync(path.join(OUT, 'logs', 'delivery')).length : 0;
console.log('='.repeat(76));
console.log(`Done. ${records} deployment records, ${audits} audit log day(s), local deploys under storage/delivery-demo/storage/delivery/local/`);
console.log('Guards demonstrated: QA gate, approval gate, dry-run isolation, retry policy, auth non-retry, rollback + revert.');
system.close();
