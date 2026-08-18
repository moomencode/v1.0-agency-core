import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ensureDir, readJson, writeJson, atomicWrite, sanitizeName } from '../runtime/utils.js';
import { artError, ART_CODES } from './errors.js';
import { resolveFormat, ARTIFACT_TYPES } from './formats.js';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function timestampPrefix(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function serializeContent(content) {
  if (typeof content === 'string') return content;
  if (Buffer.isBuffer(content)) return content.toString('utf8');
  return JSON.stringify(content, null, 2);
}

const SAFE_ID_CHARS = /[^a-z0-9._-]/gi;

function safeIdPart(value, fallback) {
  const cleaned = String(value ?? '').replace(SAFE_ID_CHARS, '_').slice(0, 96);
  if (!cleaned || cleaned === '.' || cleaned === '..') return fallback;
  return cleaned;
}

function slugifyName(name) {
  const slug = sanitizeName(name).toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug || 'artifact';
}

export class ArtifactManager {
  constructor({ root, sweeperMs = 60000 } = {}) {
    this.base = path.join(root, 'storage', 'artifacts-engine');
    this.closed = false;
    this.stats = { created: 0, versions: 0, removed: 0, expired: 0, verified: 0, searches: 0 };
    ensureDir(this.base);
    this.index = this._loadIndex();
    this._sweeper = null;
    if (sweeperMs > 0) {
      this._sweeper = setInterval(() => this.sweepExpired().catch(() => {}), sweeperMs);
      this._sweeper.unref?.();
    }
  }

  _indexPath() {
    return path.join(this.base, '_index.json');
  }

  _loadIndex() {
    try {
      const raw = readJson(this._indexPath());
      if (raw && typeof raw.keys === 'object' && typeof raw.artifacts === 'object') return raw;
    } catch {
      /* first run */
    }
    return { keys: {}, artifacts: {} };
  }

  _saveIndex() {
    writeJson(this._indexPath(), this.index);
  }

  _dir(projectId, workflowId, type, runId = null) {
    const parts = [this.base, safeIdPart(projectId, 'unassigned'), safeIdPart(workflowId, 'manual'), type];
    if (runId) parts.push(safeIdPart(runId, 'run'));
    const dir = path.join(...parts);
    ensureDir(dir);
    return dir;
  }

  _relPath(projectId, workflowId, type, runId, filename) {
    const parts = [safeIdPart(projectId, 'unassigned'), safeIdPart(workflowId, 'manual'), type];
    if (runId) parts.push(safeIdPart(runId, 'run'));
    return path.join(...parts, filename);
  }

  _validateInput({ type, format }) {
    if (!ARTIFACT_TYPES.includes(type)) throw artError(ART_CODES.TYPE_UNKNOWN, `unknown artifact type "${type}"`, { type });
    let fmt;
    try {
      fmt = resolveFormat(format);
    } catch (err) {
      throw artError(ART_CODES.FORMAT_UNKNOWN, `unknown artifact format "${format}"`, { format });
    }
    return fmt;
  }

  _guardOpen() {
    if (this.closed) throw artError(ART_CODES.STORE_CLOSED, 'artifact manager is closed', {});
  }

  _artifactKey(projectId, workflowId, type, name) {
    return `${safeIdPart(projectId, 'unassigned')}::${safeIdPart(workflowId, 'manual')}::${type}::${slugifyName(name)}`;
  }

  latestVersion(key) {
    return this.index.keys[key]?.versions?.length ?? 0;
  }

  create({ name, type, format, content, projectId = 'unassigned', workflowId = 'manual', runId = null, stepId = null, sourceDocument = null, title = null, summary = null, tags = [], generatedBy = null, expiresInMs = 0, metadata = {}, autoName = false }) {
    this._guardOpen();
    const fmt = this._validateInput({ type, format });
    if (content === undefined || content === null) throw new TypeError('artifact content is required');
    const bytes = fmt.binary ? Buffer.from(content) : Buffer.from(serializeContent(content), 'utf8');
    projectId = safeIdPart(projectId, 'unassigned');
    workflowId = safeIdPart(workflowId, 'manual');
    runId = runId ? safeIdPart(runId, 'run') : null;

    const now = new Date();
    const slug = slugifyName(name ?? (autoName ? `${type}-${workflowId}-${now.toISOString().slice(0, 19).replace(/[-:T]/g, '')}` : 'artifact'));
    const key = this._artifactKey(projectId, workflowId, type, name ?? slug);
    const version = this.latestVersion(key) + 1;
    const filename = `${slug}-v${version}.${fmt.extension}`;
    const relativePath = this._relPath(projectId, workflowId, type, runId, filename);
    const dir = this._dir(projectId, workflowId, type, runId);

    const baseResolved = path.resolve(this.base);
    const dirResolved = path.resolve(dir);
    if (dirResolved !== baseResolved && !dirResolved.startsWith(baseResolved + path.sep)) {
      throw artError(ART_CODES.PATH_INVALID, `artifact path escapes storage base: ${relativePath}`, { projectId, workflowId, runId });
    }

    const record = {
      schema: 'https://agency.os/artifacts/artifact',
      // ID-1 (4.7.0): deterministic, content-addressed id derived from the
      // identity key + version (no randomness). Legacy random-UUID records stay
      // readable via the index / sidecar meta files.
      id: `art-${createHash('sha256').update(`${key}|v${version}`).digest('hex').slice(0, 16)}`,
      name: name ?? slug,
      slug,
      type,
      format: fmt.format,
      extension: fmt.extension,
      mime: fmt.mime,
      version,
      checksum: sha256(bytes),
      sizeBytes: bytes.length,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      accessedAt: now.toISOString(),
      expiresAt: expiresInMs > 0 ? new Date(Date.now() + expiresInMs).toISOString() : null,
      projectId: projectId || 'unassigned',
      workflowId: workflowId || 'manual',
      runId,
      stepId,
      sourceDocument,
      title,
      summary,
      tags,
      generatedBy,
      filename,
      relativePath,
      metadata
    };

    if (fmt.binary) fs.writeFileSync(path.join(dir, filename), bytes);
    else atomicWrite(path.join(dir, filename), serializeContent(content));

    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) throw artError(ART_CODES.STORE_CLOSED, 'artifact write failed', { filename });

    writeJson(`${filePath}.meta.json`, record);

    const entry = this.index.keys[key] ?? { key, project: record.projectId, workflow: record.workflowId, type, name: record.name, versions: [], latest: null, updatedAt: record.createdAt };
    entry.versions.push(record.id);
    entry.latest = record.id;
    entry.updatedAt = record.createdAt;
    this.index.keys[key] = entry;
    this.index.artifacts[record.id] = record;
    this._saveIndex();

    if (this.latestVersion(key) > 1) this.stats.versions++;
    this.stats.created++;
    return record;
  }

  fromDocument(document, { format = 'json', type = 'document', ...overrides } = {}) {
    const value = document.value !== undefined ? document.value : document.content;
    const content =
      format === 'json'
        ? JSON.stringify(value ?? document, null, 2)
        : format === 'markdown'
          ? docToMarkdown(document, value)
          : format === 'html'
            ? docToHtml(document, value)
            : JSON.stringify(value ?? document, null, 2);
    return this.create({
      name: document.name ?? document.title ?? 'document',
      type,
      format,
      content,
      workflowId: document.workflowId ?? 'manual',
      runId: document.runId ?? null,
      stepId: document.stepId ?? null,
      sourceDocument: document.name ?? null,
      title: document.title ?? null,
      summary: document.summary ?? null,
      generatedBy: 'artifact-engine',
      ...overrides
    });
  }

  latest(projectId, workflowId, type, name) {
    const key = this._artifactKey(projectId, workflowId, type, name);
    const entry = this.index.keys[key];
    if (!entry?.latest) throw artError(ART_CODES.NOT_FOUND, `no artifact ${key}`, { key });
    return this.get(entry.latest);
  }

  history(projectId, workflowId, type, name) {
    const key = this._artifactKey(projectId, workflowId, type, name);
    const entry = this.index.keys[key];
    if (!entry) return [];
    return entry.versions.map((id) => this.index.artifacts[id]).filter(Boolean);
  }

  get(id) {
    const record = this.index.artifacts[id];
    if (!record) throw artError(ART_CODES.NOT_FOUND, `no artifact "${id}"`, { id });
    return record;
  }

  readFile(record) {
    const full = path.join(this.base, record.relativePath);
    if (!fs.existsSync(full)) throw artError(ART_CODES.NOT_FOUND, `artifact file missing: ${record.relativePath}`, { id: record.id });
    const bytes = fs.readFileSync(full);
    this._touch(record);
    return bytes;
  }

  readText(record) {
    return this.readFile(record).toString('utf8');
  }

  _touch(record) {
    record.accessedAt = new Date().toISOString();
    writeJson(`${path.join(this.base, record.relativePath)}.meta.json`, record);
  }

  verify(record) {
    this.stats.verified++;
    const full = path.join(this.base, record.relativePath);
    if (!fs.existsSync(full)) return false;
    const actual = sha256(fs.readFileSync(full));
    return actual === record.checksum;
  }

  list({ projectId = null, workflowId = null, type = null, runId = null, limit = 500 } = {}) {
    const out = [];
    for (const entry of Object.values(this.index.keys)) {
      if (projectId && entry.project !== projectId) continue;
      if (workflowId && entry.workflow !== workflowId) continue;
      if (type && entry.type !== type) continue;
      const record = this.index.artifacts[entry.latest];
      if (!record) continue;
      if (runId && record.runId !== runId) continue;
      out.push(record);
      if (out.length >= limit) break;
    }
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  }

  search(query, { limit = 10 } = {}) {
    this.stats.searches++;
    const tokens = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const scored = [];
    for (const record of Object.values(this.index.artifacts)) {
      const haystack = `${record.name} ${record.title ?? ''} ${record.summary ?? ''} ${record.tags.join(' ')} ${record.type} ${record.workflowId} ${JSON.stringify(record.metadata ?? {}).toLowerCase()}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (record.name.toLowerCase().includes(token)) score += 5;
        else if (haystack.includes(token)) score += 1;
      }
      if (score > 0) scored.push({ score, id: record.id, name: record.name, type: record.type, version: record.version, checksum: record.checksum, relativePath: record.relativePath });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  remove(id) {
    const record = this.index.artifacts[id];
    if (!record) throw artError(ART_CODES.NOT_FOUND, `no artifact "${id}"`, { id });
    const full = path.join(this.base, record.relativePath);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    const metaPath = `${full}.meta.json`;
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    delete this.index.artifacts[id];
    const key = this._artifactKey(record.projectId, record.workflowId, record.type, record.name);
    const entry = this.index.keys[key];
    if (entry) {
      entry.versions = entry.versions.filter((vid) => vid !== id);
      entry.latest = entry.versions.length > 0 ? entry.versions[entry.versions.length - 1] : null;
      if (entry.versions.length === 0) delete this.index.keys[key];
    }
    this._saveIndex();
    this.stats.removed++;
    return true;
  }

  cleanup({ projectId = null, workflowId = null, type = null, olderThanDays = null, maxVersions = null, expire = true, dryRun = false } = {}) {
    this._guardOpen();
    const now = Date.now();
    let candidates = Object.values(this.index.artifacts);
    if (projectId) candidates = candidates.filter((r) => r.projectId === projectId);
    if (workflowId) candidates = candidates.filter((r) => r.workflowId === workflowId);
    if (type) candidates = candidates.filter((r) => r.type === type);

    const toRemove = [];
    if (olderThanDays) {
      for (const record of candidates) {
        const ref = Date.parse(record.accessedAt ?? record.updatedAt ?? record.createdAt);
        if (now - ref > olderThanDays * 24 * 60 * 60 * 1000) toRemove.push(record.id);
      }
    }
    if (maxVersions) {
      for (const entry of Object.values(this.index.keys)) {
        if (projectId && entry.project !== projectId) continue;
        if (workflowId && entry.workflow !== workflowId) continue;
        if (type && entry.type !== type) continue;
        if (entry.versions.length <= maxVersions) continue;
        const excess = entry.versions.length - maxVersions;
        for (const id of entry.versions.slice(0, excess)) {
          if (!toRemove.includes(id)) toRemove.push(id);
        }
      }
    }
    if (expire) {
      for (const record of candidates) {
        if (record.expiresAt && Date.parse(record.expiresAt) <= now) {
          if (!toRemove.includes(record.id)) toRemove.push(record.id);
        }
      }
    }
    if (dryRun) return { removed: toRemove.length, ids: toRemove };
    for (const id of toRemove) this.remove(id);
    return { removed: toRemove.length, ids: toRemove };
  }

  async sweepExpired() {
    if (this.closed) return 0;
    const result = this.cleanup({ expire: true });
    this.stats.expired += result.removed;
    return result.removed;
  }

  rebuildIndex() {
    this.index = { keys: {}, artifacts: {} };
    const walk = (dir, rel) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full, path.join(rel, item.name));
        else if (item.name.endsWith('.meta.json')) {
          try {
            const record = readJson(full);
            if (!record?.id) continue;
            this.index.artifacts[record.id] = record;
            const key = this._artifactKey(record.projectId, record.workflowId, record.type, record.name);
            const entry = this.index.keys[key] ?? { key, project: record.projectId, workflow: record.workflowId, type: record.type, name: record.name, versions: [], latest: null, updatedAt: record.createdAt };
            if (!entry.versions.includes(record.id)) entry.versions.push(record.id);
            entry.latest = record.id;
            this.index.keys[key] = entry;
          } catch {
            /* corrupt sidecar skipped */
          }
        }
      }
    };
    walk(this.base, '');
    this._saveIndex();
    return Object.keys(this.index.artifacts).length;
  }

  statsSnapshot() {
    return { ...this.stats, artifacts: Object.keys(this.index.artifacts).length, keys: Object.keys(this.index.keys).length };
  }

  close() {
    if (this._sweeper) clearInterval(this._sweeper);
    this.closed = true;
  }
}

export function docToMarkdown(document, value) {
  const title = document.title ?? document.name ?? 'Document';
  const lines = [`# ${title}`, ''];
  if (document.summary) lines.push(`> ${document.summary}`, '');
  if (document.workflowId) lines.push(`- Workflow: \`${document.workflowId}\``);
  if (document.runId) lines.push(`- Run: \`${document.runId}\``);
  if (document.checksum) lines.push(`- Checksum: \`${document.checksum}\``);
  lines.push('', '## Content', '');
  const dump = (obj, indent) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'object') {
        lines.push(`${indent}**${k}**:`, '');
        dump(v, indent + '  ');
      } else {
        lines.push(`${indent}- **${k}**: ${typeof v === 'string' ? v.replace(/\n/g, ' ') : JSON.stringify(v)}`);
      }
    }
  };
  dump(value, '');
  return lines.join('\n');
}

export function docToHtml(document, value) {
  const title = document.title ?? document.name ?? 'Document';
  const body = `<pre>${escapeHtml(JSON.stringify(value ?? document, null, 2))}</pre>`;
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>\n`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
