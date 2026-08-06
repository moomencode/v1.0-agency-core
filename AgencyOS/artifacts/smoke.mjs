import { ArtifactSystem } from './index.js';
import { FORMATS } from './formats.js';
import { artError, ART_CODES } from './errors.js';
import { Executor } from '../runtime/executor.js';
import { sleep } from '../runtime/utils.js';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TEST_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage', 'artifacts-smoke');
fs.rmSync(TEST_ROOT, { recursive: true, force: true });

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, label, extra = '') {
  if (cond) {
    pass++;
    console.log(`PASS ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`FAIL ${label} ${extra}`);
  }
}

const sys = new ArtifactSystem({ root: TEST_ROOT, sweeperMs: 0 });
const { manager } = { manager: sys.manager };

try {
  assert(Object.keys(FORMATS).length >= 7 && FORMATS.pdf.binary && FORMATS.image.binary, 'format registry: markdown/json/html/pdf/image/svg');
  assert(sys.types.includes('research-report') && sys.types.includes('sales-proposal') && sys.types.includes('contract'), 'artifact type taxonomy includes reports, proposals, contracts');

  const a1 = sys.create({ name: 'cairo-market-analysis', type: 'research-report', format: 'json', content: JSON.stringify({ market: 'Cairo F&B', size: 1200 }), workflowId: 'business-analysis', runId: 'run-1', projectId: 'acme', tags: ['market', 'cairo'] });
  assert(a1.checksum.length === 64 && a1.version === 1 && a1.relativePath.includes('acme') && a1.relativePath.includes('business-analysis') && a1.relativePath.includes('research-report'), 'create: checksum + organized folder path');
  const full = path.join(TEST_ROOT, 'storage', 'artifacts-engine', a1.relativePath);
  assert(fs.existsSync(full), 'artifact file written to disk');
  assert(fs.existsSync(full + '.meta.json'), 'metadata sidecar written');
  const actual = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  assert(actual === a1.checksum, 'checksum matches file bytes');

  const a2 = sys.create({ name: 'cairo-market-analysis', type: 'research-report', format: 'json', content: JSON.stringify({ market: 'Cairo F&B', size: 1500 }), workflowId: 'business-analysis', runId: 'run-1', projectId: 'acme' });
  const a3 = sys.create({ name: 'cairo-market-analysis', type: 'research-report', format: 'json', content: JSON.stringify({ market: 'Cairo F&B', size: 1700 }), workflowId: 'business-analysis', runId: 'run-1', projectId: 'acme' });
  assert(a2.version === 2 && a3.version === 3, 'versioning increments (v1 -> v2 -> v3)');
  const latest = manager.latest('acme', 'business-analysis', 'research-report', 'cairo-market-analysis');
  assert(latest.version === 3 && latest.id === a3.id, 'latest() resolves the newest version');
  const history = manager.history('acme', 'business-analysis', 'research-report', 'cairo-market-analysis');
  assert(history.length === 3 && history.map((h) => h.version).join(',') === '1,2,3', 'history keeps every version in order');

  const auto = sys.create({ type: 'report', format: 'markdown', content: '# Auto', workflowId: 'lead-discovery', autoName: true });
  assert(/^report-lead-discovery-\d{14}-v1\.md$/.test(auto.filename), 'automatic naming when name omitted (got ' + auto.filename + ')');

  sys.create({ name: 'site-config', type: 'website-config', format: 'markdown', content: '# Config', workflowId: 'website-generation' });
  sys.create({ name: 'home-page', type: 'website', format: 'html', content: '<html><body>Hello</body></html>', workflowId: 'website-generation' });
  sys.create({ name: 'brand-guidelines', type: 'brand-document', format: 'pdf', content: Buffer.from('%PDF-1.4 fake pdf bytes'), workflowId: 'business-analysis' });
  assert(manager.get(auto.id) && manager.search('config').some((s) => s.name === 'site-config'), 'markdown + html artifacts created');
  const pdf = manager.history('unassigned', 'business-analysis', 'brand-document', 'brand-guidelines')[0];
  assert(pdf.mime === 'application/pdf' && pdf.sizeBytes === Buffer.from('%PDF-1.4 fake pdf bytes').length && sys.manager.verify(pdf), 'binary PDF artifact with verified checksum');
  sys.create({ name: 'hero', type: 'image', format: 'image', content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), workflowId: 'website-generation' });
  assert(manager.search('hero').length === 1, 'image artifact created');

  const doc = { name: 'lead', value: { business: 'Cafe Cairo', qualityScore: 88 }, workflowId: 'lead-discovery', runId: 'run-2', stepId: '02', checksum: 'abc123' };
  const dj = sys.fromDocument(doc, { format: 'json' });
  assert(JSON.parse(sys.manager.readText(dj)).business === 'Cafe Cairo', 'fromDocument: JSON conversion');
  const dm = sys.fromDocument(doc, { format: 'markdown' });
  assert(sys.manager.readText(dm).includes('qualityScore'), 'fromDocument: Markdown conversion');

  const report = sys.builders.buildRunReport({ runId: 'run-x', workflowId: 'qa', status: 'completed', documents: { review: { checksum: 'chk' } }, steps: [{ id: '04', actor: 'QA', status: 'completed', durationMs: 5 }] });
  assert(report.includes('# Run Report') && report.includes('**completed**') && report.includes('| 04 | QA |'), 'run report builder');
  const seo = sys.builders.buildSeoReport({ name: 'seo' }, { title: 'Cafe Cairo', keywords: 'koshary' });
  assert(seo.includes('## Recommendations') && seo.includes('Cafe Cairo'), 'SEO report builder');
  const wc = sys.builders.buildWebsiteConfig({ name: 'website' }, { businessId: 'b1', engineVersion: '2.0' });
  assert(JSON.parse(wc).engineVersion === '2.0' && JSON.parse(wc).schema.includes('website-config'), 'website config builder produces engine config');
  const prop = sys.builders.buildProposal({ name: 'proposal' }, { title: 'Website Package', scope: [{ name: 'Landing' }], pricing: { total: 2500 }, status: 'ready' });
  assert(prop.includes('Website Package') && prop.includes('Landing') && prop.includes('2500'), 'sales proposal builder');
  const ux = sys.builders.buildUxAudit({ name: 'audit' }, { verdict: 'pass', findings: [{ severity: 'high', title: 'broken nav' }] });
  assert(ux.includes('broken nav') && ux.includes('**pass**'), 'UX audit builder');
  const brand = sys.builders.buildBrandDocument({ name: 'brand' }, { name: 'Cafe Cairo', palette: { primary: '#c0392b' } });
  assert(brand.includes('Cafe Cairo') && brand.includes('#c0392b'), 'brand document builder');
  const contract = sys.builders.buildContract({ name: 'contract' }, { title: 'Services Agreement', counterparty: 'Cafe Cairo' });
  assert(contract.includes('Services Agreement') && contract.includes('Signature'), 'contract builder');

  const captured = await sys.captureRun({
    runId: 'run-9',
    workflowId: 'website-generation',
    status: 'completed',
    documents: { website: { value: { businessId: 'b9' }, checksum: 'chk9' } }
  }, { projectId: 'acme' });
  assert(captured.created.length >= 3, 'captureRun materializes documents + run report (got ' + captured.created.length + ')');
  assert(captured.created.some((a) => a.type === 'website-config'), 'captureRun uses workflow-specific builder (website-config)');
  assert(captured.created.some((a) => a.type === 'report' && a.format === 'markdown'), 'captureRun emits run report');

  const hits = sys.manager.search('cairo');
  assert(hits.length >= 1 && hits[0].name.includes('cairo-market'), 'search finds artifacts by name');

  const intact = manager.verify(a1);
  fs.writeFileSync(full, 'corrupted');
  const corrupted = manager.verify(a1);
  assert(intact === true && corrupted === false, 'verify() detects tampering (checksum mismatch)');

  const mm = new ArtifactSystem({ root: TEST_ROOT, sweeperMs: 0 }).manager;
  for (let i = 0; i < 4; i++) mm.create({ name: 'churny', type: 'report', format: 'text', content: `v${i}`, workflowId: 'wf' });
  const cleaned = mm.cleanup({ maxVersions: 2, type: 'report', workflowId: 'wf' });
  assert(cleaned.removed === 2 && mm.history('unassigned', 'wf', 'report', 'churny').length === 2, 'cleanup prunes to maxVersions');
  mm.close();

  const aged = sys.create({ name: 'stale', type: 'document', format: 'json', content: '{}', workflowId: 'wf', projectId: 'acme' });
  const agedFull = path.join(TEST_ROOT, 'storage', 'artifacts-engine', aged.relativePath);
  const agedMeta = agedFull + '.meta.json';
  const agedRecord = JSON.parse(fs.readFileSync(agedMeta, 'utf8'));
  agedRecord.accessedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(agedMeta, JSON.stringify(agedRecord));
  sys.manager.index.artifacts[aged.id] = agedRecord;
  const dry = sys.manager.cleanup({ olderThanDays: 10, dryRun: true });
  assert(dry.removed >= 1 && fs.existsSync(agedFull), 'cleanup dryRun reports without deleting');
  const real = sys.manager.cleanup({ olderThanDays: 10 });
  assert(real.removed >= 1 && !fs.existsSync(agedFull), 'cleanup removes artifacts older than retention');

  const ep = sys.create({ name: 'ephemeral', type: 'document', format: 'json', content: '{}', workflowId: 'wf', expiresInMs: 50 });
  await sleep(90);
  const swept = await sys.manager.sweepExpired();
  assert(swept >= 1 && !fs.existsSync(path.join(TEST_ROOT, 'storage', 'artifacts-engine', ep.relativePath)), 'expiration sweeper removes TTL artifacts');

  const stats = sys.stats();
  assert(stats.manager.created >= 14 && stats.manager.removed >= 2, 'stats track created/removed');

  sys.close();
  await sleep(30);
  assert(true, 'close stops sweeper');
} catch (err) {
  fail++;
  failures.push('uncaught: ' + err.stack);
  console.log('FAIL uncaught', err.stack);
}

console.log('');
console.log(`=== ARTIFACTS SMOKE: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) {
  console.log('failures:', failures.join(' | '));
  process.exit(1);
}
