import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ArtifactSystem } from '../../artifacts/index.js';
import { DeliveryArtifacts } from '../artifacts/builders.js';
import { assert, runTests, scratchRoot } from './helpers.mjs';

const root = scratchRoot('artifacts-serialization');
const artifacts = new ArtifactSystem({ root, sweeperMs: 0 });
const bridge = new DeliveryArtifacts({ artifacts, logger: null });

const NOW = '2026-08-11T10:00:00.000Z';
const record = {
  id: 'del-1',
  businessId: 'biz-1',
  mode: 'full',
  provider: 'mock',
  status: 'verified',
  trace: { buildId: 'bld-1', pipelineRunId: 'pp-1' },
  target: { domain: 'biz-1.example.test' },
  package: { packageId: 'bld-1', bundleSha256: 'x'.repeat(64), fileCount: 3 },
  deployment: { deploymentId: 'dep-1', url: 'https://biz-1.example.test', provider: 'mock' },
  apiToken: 'sk-leak-me-1234567890',
  timeline: [{ event: 'DEPLOY_OK', from: 'approved', to: 'deployed', at: NOW }],
  createdAt: NOW,
  updatedAt: NOW
};
const qaReport = { businessId: 'biz-1', buildId: 'bld-1', passed: true, totals: { checks: 4, passed: 4, failed: 0 } };

const tests = [
  ['deployment record artifact persists as valid JSON', () => {
    const rec = bridge.writeRecord({ kind: 'deployment', record });
    const text = artifacts.manager.readText(rec);
    const parsed = JSON.parse(text);
    assert(parsed.id === 'del-1' && parsed.status === 'verified' && parsed.deployment.url === 'https://biz-1.example.test', 'payload roundtrip equals record');
    assert(text !== '[object Object]' && !text.includes('[object Object]'), 'no [object Object] coercion');
    assert(rec.sizeBytes > 15, `record size reflects serialized payload (${rec.sizeBytes})`);
    assert(artifacts.manager.verify(rec), 'checksum covers the serialized bytes');
  }],
  ['redaction travels through the object payload', () => {
    const rec = bridge.writeRecord({ kind: 'deployment', record });
    const text = artifacts.manager.readText(rec);
    assert(!text.includes('sk-leak-me-1234567890'), 'secret token absent from artifact');
    assert(text.includes('[REDACTED]'), 'secret token redacted through the object path');
  }],
  ['qa report artifact persists as valid JSON', () => {
    const rec = bridge.writeQaReport({ buildId: 'bld-1', qaReport });
    const text = artifacts.manager.readText(rec);
    const parsed = JSON.parse(text);
    assert(parsed.passed === true && parsed.totals.checks === 4, 'qa payload roundtrip equals qaReport');
    assert(text !== '[object Object]' && !text.includes('[object Object]'), 'no [object Object] coercion');
    assert(rec.sizeBytes > 15, `record size reflects serialized payload (${rec.sizeBytes})`);
    assert(artifacts.manager.verify(rec), 'checksum covers the serialized bytes');
  }],
  ['qa artifact checksum was not snapshotted over the corrupted literal', () => {
    const rec = bridge.writeQaReport({ buildId: 'bld-1', qaReport });
    const meta = JSON.parse(fs.readFileSync(path.join(artifacts.manager.base, rec.relativePath) + '.meta.json', 'utf8'));
    const corruptChecksum = createHash('sha256').update('[object Object]').digest('hex');
    assert(meta.sizeBytes > 15 && meta.checksum !== corruptChecksum, 'meta checksum is not over the corrupted literal');
  }]
];

await runTests('delivery/artifacts-serialization', tests);