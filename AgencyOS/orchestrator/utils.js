import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  hashString,
  shortHash,
  stableStringify,
  nowIso,
  ensureDir,
  atomicWrite,
  readJson,
  writeJson,
  sleep
} from '../runtime/utils.js';

export const ORC_API_VERSION = '1.0';

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

export function hex16(hash) {
  return hash.slice(0, 16);
}

export function campaignIdFor(spec) {
  return `cmp-${hex16(sha256(spec))}`;
}

export function executionIdFor(campaignId, businessId, workflowVersion) {
  return `orc-${hex16(sha256(`${campaignId}|${businessId}|${workflowVersion}`))}`;
}

export function approvalIdFor(executionId, kind, step) {
  return `apr-${hex16(sha256(`${executionId}|${kind}|${step}`))}`;
}

export function fingerprint(value) {
  return sha256(stableStringify(value));
}

export function canonicalSpec(spec) {
  const { createdAt, updatedAt, startedAt, ...rest } = spec || {};
  return stableStringify(rest);
}

export function instanceRoot(root, executionId) {
  return path.join(root, 'instances', executionId);
}

export function campaignFile(root, campaignId) {
  return path.join(root, 'campaigns', `${campaignId}.json`);
}

export function approvalFile(root, approvalId) {
  return path.join(root, 'approvals', `${approvalId}.json`);
}

export function checkpointFile(root, executionId) {
  return path.join(instanceRoot(root, executionId), 'checkpoint.json');
}

export function traceNdjsonFile(root, executionId) {
  return path.join(instanceRoot(root, executionId), 'trace.ndjson');
}

export function traceJsonFile(root, executionId) {
  return path.join(instanceRoot(root, executionId), 'trace.json');
}

export function executionReportFile(root, executionId) {
  return path.join(instanceRoot(root, executionId), 'execution-report.json');
}

export function sanitizeBusinessId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function nowIsoMs() {
  return new Date().toISOString();
}

export { hashString, shortHash, stableStringify, nowIso, ensureDir, atomicWrite, readJson, writeJson, sleep };
