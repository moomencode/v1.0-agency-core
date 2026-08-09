import fs from 'node:fs';
import path from 'node:path';
import { createDeliverySystem } from '../index.js';
import { SecretVault } from '../security/secrets.js';
import { scanText, scanFiles } from '../security/scan.js';
import { redact, safeForLog } from '../security/redaction.js';
import { cleanSite, scratchRoot, assert, runTests } from './helpers.mjs';

const root = scratchRoot('security');
const vault = new SecretVault({ env: { VERCEL_TOKEN: 'vercel-secret-token-12345', STRIPE_KEY: 'stripe-sk-abc' } });
const filesByBusiness = new Map();
const fakeEngine = {
  export(site) {
    return filesByBusiness.get(site.businessId) || {};
  }
};
const system = createDeliverySystem({ root, vault, autoAllowed: false, engine: fakeEngine });

async function buildFor(overrides = {}) {
  const fixture = cleanSite('sec-cafe-001', { version: 1 });
  const { site, validation } = fixture;
  let files = { ...fixture.files };
  if (overrides.files) files = { ...files, ...overrides.files };
  filesByBusiness.set('sec-cafe-001', files);
  const result = await system.builds.build('sec-cafe-001', { site, validation, trace: fixture.trace });
  const tree = system.builds.readTree(result.buildId);
  const qa = system.qa.run({ buildId: result.buildId, site, validation, buildRecord: result.record, files: tree });
  system.packaging.packageBuild({ buildId: result.buildId, buildRecord: result.record, qaReport: qa, tree });
  return { ...result, tree };
}

const tests = [
  ['vault values never appear in deployment records', async () => {
    const { buildId } = await buildFor();
    const record = await system.deliver({ buildId, mode: 'dry-run', provider: 'local', target: { project: 'sec-target', token: 'vercel-secret-token-12345' } });
    const raw = JSON.stringify(record);
    assert(!raw.includes('vercel-secret-token-12345'), 'record has no vault secret');
    assert(record.target.token === '[REDACTED]', 'target token redacted');
  }],
  ['vault values never appear in package manifests', async () => {
    const { buildId } = await buildFor();
    const manifest = system.packaging.loadManifest(buildId);
    assert(!JSON.stringify(manifest).includes('vercel-secret-token-12345'), 'manifest clean');
  }],
  ['vault values never appear in audit logs', async () => {
    const { buildId } = await buildFor();
    await system.deliver({ buildId, mode: 'dry-run', provider: 'local', target: { project: 'sec-target', token: 'vercel-secret-token-12345' } });
    const logDir = path.join(root, 'logs', 'delivery');
    const logFile = fs.readdirSync(logDir).sort().at(-1);
    const content = fs.readFileSync(path.join(logDir, logFile), 'utf8');
    assert(!content.includes('vercel-secret-token-12345'), 'audit log clean');
  }],
  ['secrets detected in the production tree fail the QA gate', async () => {
    const base = cleanSite('sec-cafe-001');
    const { buildId, tree } = await buildFor({ files: { 'leak.txt': 'api key = sk-abcdef0123456789' } });
    const buildRecord = system.builds.loadBuild(buildId);
    const report = system.qa.run({ buildId, site: base.site, validation: base.validation, buildRecord, files: tree });
    assert(!report.passed, 'qa fails on secret');
    const secretsGroup = report.groups.find((g) => g.id === 'secrets');
    assert(secretsGroup && !secretsGroup.passed, 'secrets group failed');
    assert(secretsGroup.checks.some((c) => !c.ok), 'flag raised');
  }],
  ['deployment is blocked when QA report does not exist', async () => {
    const base = cleanSite('sec-cafe-001');
    const { buildId, tree } = await buildFor();
    system.qa.run({ buildId, site: base.site, validation: base.validation, buildRecord: system.builds.loadBuild(buildId), files: tree });
    fs.rmSync(path.join(root, 'storage', 'delivery', 'qa', buildId), { recursive: true, force: true });
    let threw = false;
    try {
      await system.deliver({ buildId, mode: 'dry-run' });
    } catch (err) {
      threw = true;
      assert(err.code === 'E_DEL_QA_FAILED', `code ${err.code}`);
    }
    assert(threw, 'blocked without QA report');
  }],
  ['secret scan also flags AWS / GitHub / Slack tokens', () => {
    for (const token of ['AKIAIOSFODNN7EXAMPLE', 'ghp_abcdefghijklmnopqrstuvwxyz123456', 'xoxb-1234567890-abcdefgh']) {
      assert(scanText(token).length > 0, `flagged ${token.slice(0, 8)}...`);
    }
  }],
  ['scanFiles exposes path and match types for the QA group', () => {
    const results = scanFiles({ 'env.js': 'token: ghp_abcdefghijklmnopqrstuvwxyz123456' });
    assert(results.length === 1 && results[0].matches.some((m) => m.type === 'known-prefix'), 'github match flagged');
  }],
  ['safeForLog strips secrets from arbitrary structures', () => {
    const out = safeForLog({ ok: true, nested: { apiKey: 'stripe-sk-abc' } }, { vault });
    assert(!out.includes('stripe-sk-abc'), 'no raw secret');
    assert(out.includes('[REDACTED]'), 'redacted marker present');
  }],
  ['redact is stable across runs (no random output)', () => {
    const a = JSON.stringify(redact({ t: { key: 'ghp_abcdefghijklmnopqrstuvwxyz123456' } }, { vault }));
    const b = JSON.stringify(redact({ t: { key: 'ghp_abcdefghijklmnopqrstuvwxyz123456' } }, { vault }));
    assert(a === b, 'deterministic redaction');
  }],
  ['vault secret embedded in a larger string is redacted without nuking the text', () => {
    const text = 'configured endpoint vercel-secret-token-12345 used as the deploy token';
    const out = redact(text, { vault });
    assert(!out.includes('vercel-secret-token-12345'), 'embedded secret removed');
    assert(out.includes('[REDACTED]'), 'redaction marker present');
    assert(out.includes('configured endpoint') && out.includes('used as the deploy token'), 'surrounding text preserved');
    assert(out !== '[REDACTED]', 'whole string is not destroyed');
  }],
  ['scan-detected secret embedded in text keeps legitimate business text', () => {
    const text = 'Acme Cafe config token ghp_abcdefghijklmnopqrstuvwxyz123456 deploys nightly';
    const out = redact(text, { vault });
    assert(!out.includes('ghp_abcdefghijklmnopqrstuvwxyz123456'), 'github token removed');
    assert(out.includes('Acme Cafe') && out.includes('deploys nightly'), 'business text preserved');
  }],
  ['safeForLog redacts embedded secrets inside string values', () => {
    const out = safeForLog('deployment uses vercel-secret-token-12345 in the pipeline', { vault });
    assert(!out.includes('vercel-secret-token-12345'), 'no raw secret in log line');
    assert(out.includes('deployment uses') && out.includes('in the pipeline'), 'surrounding line kept');
  }],
  ['vault requires are case-sensitive and env-only', () => {
    assert(vault.get('VERCEL_TOKEN') === 'vercel-secret-token-12345', 'token present');
    assert(!vault.has('token'), 'lowercase not matched');
  }]
];

await runTests('delivery/security', tests);
