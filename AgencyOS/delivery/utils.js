import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stableJson } from '../website-engine/utils.js';

export { stableJson };

export function sha256(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function shortHash(text, len = 12) {
  return sha256(String(text)).slice(0, len);
}

export function buildIdFrom({ businessId, dossierVersion, pipelineRunId }, engineOutputChecksum) {
  const joined = [String(businessId), String(dossierVersion), String(pipelineRunId), String(engineOutputChecksum)].join('|');
  return sha256(joined).slice(0, 16);
}

export function computeEngineChecksum(site, files) {
  return sha256(`${stableJson(site)}::${stableJson(files)}`);
}

export function recordIdFor(buildId) {
  return `dep_${buildId}`;
}

export function posixPath(p) {
  return String(p).split(path.sep).join('/');
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function atomicWrite(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
  return file;
}

export function writeJson(file, value) {
  return atomicWrite(file, `${stableJson(value)}\n`);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function exists(file) {
  return fs.existsSync(file);
}

export function listSorted(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}

export function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function fileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
