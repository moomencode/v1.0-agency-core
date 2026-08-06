import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { VAL_CODES } from './errors.js';

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function walk(node, pathStr, visit) {
  visit(node, pathStr);
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walk(node[i], `${pathStr}[${i}]`, visit);
  } else if (isObj(node)) {
    for (const [k, v] of Object.entries(node)) walk(v, `${pathStr}.${k}`, visit);
  }
}

export function parseJson(text) {
  if (typeof text !== 'string') return { ok: false, error: 'input is not a string' };
  let i = 0;
  const n = text.length;
  const errors = [];
  const fail = (msg) => {
    const e = new Error(msg);
    throw e;
  };
  const skipWs = () => {
    while (i < n && /\s/.test(text[i])) i++;
  };
  const parseString = () => {
    i++;
    let out = '';
    while (i < n) {
      const c = text[i];
      if (c === '"') { i++; return out; }
      if (c === '\\') {
        i++;
        const e = text[i];
        if (e === undefined) fail('unterminated string');
        if (e === 'u') {
          const hex = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('invalid unicode escape');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
          if (map[e] === undefined) fail(`invalid escape \\${e}`);
          out += map[e];
          i++;
        }
      } else {
        if (c.charCodeAt(0) < 0x20) fail('unescaped control character');
        out += c;
        i++;
      }
    }
    fail('unterminated string');
  };
  const parseNumber = () => {
    const start = i;
    if (text[i] === '-') i++;
    if (text[i] === '0') i++;
    else if (/[1-9]/.test(text[i] ?? '')) { while (/[0-9]/.test(text[i] ?? '')) i++; }
    else fail('invalid number');
    if (text[i] === '.') {
      i++;
      if (!/[0-9]/.test(text[i] ?? '')) fail('invalid number');
      while (/[0-9]/.test(text[i] ?? '')) i++;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++;
      if (text[i] === '+' || text[i] === '-') i++;
      if (!/[0-9]/.test(text[i] ?? '')) fail('invalid number');
      while (/[0-9]/.test(text[i] ?? '')) i++;
    }
    return Number(text.slice(start, i));
  };
  const parseObject = (p) => {
    i++;
    const obj = {};
    skipWs();
    if (text[i] === '}') { i++; return obj; }
    for (;;) {
      skipWs();
      if (text[i] !== '"') fail('expected property name');
      const key = parseString();
      skipWs();
      if (text[i] !== ':') fail('expected ":"');
      i++;
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        errors.push({ path: `${p}.${key}`, message: `duplicate key "${key}" (previous value silently overwritten)` });
      }
      obj[key] = parseValue(`${p}.${key}`);
      skipWs();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return obj; }
      fail('expected "," or "}"');
    }
  };
  const parseArray = (p) => {
    i++;
    const arr = [];
    skipWs();
    if (text[i] === ']') { i++; return arr; }
    for (;;) {
      arr.push(parseValue(`${p}[${arr.length}]`));
      skipWs();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return arr; }
      fail('expected "," or "]"');
    }
  };
  const parseValue = (p) => {
    skipWs();
    if (i >= n) fail('unexpected end of input');
    const c = text[i];
    if (c === '{') return parseObject(p);
    if (c === '[') return parseArray(p);
    if (c === '"') return parseString();
    if (c === 't') { if (text.slice(i, i + 4) === 'true') { i += 4; return true; } fail('unexpected token'); }
    if (c === 'f') { if (text.slice(i, i + 5) === 'false') { i += 5; return false; } fail('unexpected token'); }
    if (c === 'n') { if (text.slice(i, i + 4) === 'null') { i += 4; return null; } fail('unexpected token'); }
    if (c === '-' || /[0-9]/.test(c)) return parseNumber();
    fail(`unexpected token "${c}"`);
  };
  try {
    const value = parseValue('$');
    skipWs();
    if (i < n) fail('unexpected trailing content');
    return { ok: true, value, errors };
  } catch (e) {
    return { ok: false, error: e.message, errors };
  }
}

export const PALETTE_TOKENS = ['base', 'base-deep', 'surface', 'surface-2', 'surface-3', 'primary', 'primary-light', 'primary-dark', 'ink', 'ink-muted'];
export const BUSINESS_TYPES = ['restaurant', 'cafe', 'bakery', 'pizza', 'burger', 'dessert', 'hotel', 'clinic', 'gym', 'barber', 'beauty-salon', 'other'];
export const FORMAT_EXTENSIONS = {
  pdf: ['.pdf'], png: ['.png'], jpg: ['.jpg', '.jpeg'], jpeg: ['.jpg', '.jpeg'],
  svg: ['.svg'], json: ['.json'], html: ['.html'], md: ['.md', '.markdown'],
  markdown: ['.md', '.markdown'], text: ['.txt', '.text'], webp: ['.webp'], gif: ['.gif']
};
export const FORMAT_MIMES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  svg: 'image/svg+xml', json: 'application/json', html: 'text/html', md: 'text/markdown',
  markdown: 'text/markdown', text: 'text/plain', webp: 'image/webp', gif: 'image/gif'
};
export const REF_FIELDS = ['sourceDocument', 'ref', '$ref', 'references', 'parentId', 'derivedFrom', 'assetId', 'agentId'];
const ID_KEYS = new Set(['id', 'documentId', 'leadId', 'businessId', 'runId', 'stepId', 'messageId', 'jobId', 'assetId', 'schemaId', 'serviceId', 'categoryId', 'menuId', 'workflowId', 'groupId']);

const F = (code, severity, path, message, extra = {}) => ({ code, severity, path, message, ...extra });

export const BUILTIN_RULES = [
  {
    id: 'empty-payload', label: 'payload present', severity: 'error', priority: -200,
    kinds: ['json', 'schema', 'config', 'business-config', 'theme-config', 'workflow-output', 'agent-output', 'prompt-output', 'asset'],
    check(ctx, findings) {
      const p = ctx.payload;
      if (p === undefined || p === null || (typeof p === 'string' && p.trim() === '')) {
        findings.push(F(VAL_CODES.EMPTY, 'error', '$', 'payload is empty'));
      }
    }
  },
  {
    id: 'json-parse', label: 'JSON syntax and duplicate keys', severity: 'error', priority: -100,
    kinds: ['json', 'schema', 'config', 'business-config', 'theme-config', 'workflow-output', 'agent-output', 'prompt-output', 'asset'],
    check(ctx, findings) {
      if (typeof ctx.payload !== 'string') return;
      const res = parseJson(ctx.payload);
      if (!res.ok) {
        if (ctx.kind !== 'prompt-output') {
          findings.push(F(VAL_CODES.JSON_INVALID, 'error', '$', `invalid JSON: ${res.error}`));
        }
        return;
      }
      ctx.parsed = res.value;
      for (const e of res.errors) findings.push(F(VAL_CODES.DUPLICATE_KEY, 'error', e.path, e.message));
    }
  },
  {
    id: 'duplicate-id', label: 'duplicate IDs', severity: 'error',
    kinds: ['json', 'schema', 'config', 'workflow-output', 'agent-output', 'prompt-output'],
    check(ctx, findings) {
      const root = ctx.parsed ?? ctx.payload;
      if (!isObj(root)) return;
      const seen = new Map();
      walk(root, '$', (node, p) => {
        if (!Array.isArray(node)) return;
        for (let i = 0; i < node.length; i++) {
          const item = node[i];
          if (isObj(item) && typeof item.id === 'string') {
            const list = seen.get(item.id) || [];
            list.push(`${p}[${i}]`);
            seen.set(item.id, list);
          }
        }
      });
      for (const [id, paths] of seen) {
        if (paths.length > 1) {
          findings.push(F(VAL_CODES.DUPLICATE_ID, 'error', paths[0], `duplicate ID "${id}" used ${paths.length} times`, { ref: id, detail: `all occurrences: ${paths.join(', ')}` }));
        }
      }
    }
  },
  {
    id: 'broken-refs', label: 'broken references', severity: 'error',
    kinds: ['json', 'schema', 'config', 'workflow-output', 'agent-output', 'prompt-output'],
    check(ctx, findings) {
      const root = ctx.parsed ?? ctx.payload;
      if (!isObj(root)) return;
      const ids = new Set();
      walk(root, '$', (node, p) => {
        if (!isObj(node)) return;
        for (const [k, v] of Object.entries(node)) {
          if (ID_KEYS.has(k) && typeof v === 'string') ids.add(v);
        }
      });
      const validator = ctx.engine.validator;
      const baseDir = ctx.options.baseDir || ctx.engine.root || '.';
      const canonicalRef = (ref, p) => {
        if (validator && typeof validator.canonicalFor === 'function' && validator.canonicalFor(ref)) return true;
        const agentDir = path.join(baseDir, 'agents');
        if (fs.existsSync(agentDir)) {
          for (const entry of fs.readdirSync(agentDir)) {
            const cfg = path.join(agentDir, entry, 'config.json');
            if (!fs.existsSync(cfg)) continue;
            try {
              const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
              if (c && c.id === ref) return true;
            } catch { /* ignore malformed agent configs */ }
          }
        }
        const asFile = path.join(baseDir, ref);
        return fs.existsSync(asFile);
      };
      walk(root, '$', (node, p) => {
        if (!isObj(node)) return;
        for (const [k, v] of Object.entries(node)) {
          if (k === 'schema' && typeof v === 'string') {
            if (canonicalRef(v, p)) continue;
            findings.push(F(VAL_CODES.BROKEN_REF, 'error', `${p}.schema`, `schema reference "${v}" does not resolve to a canonical schema or file`, { ref: v }));
            continue;
          }
          if (!REF_FIELDS.includes(k)) continue;
          const refs = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' ? [v] : [];
          for (const ref of refs) {
            if (ref.startsWith('#/')) continue;
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) continue;
            if (ids.has(ref)) continue;
            if (canonicalRef(ref, p)) continue;
            findings.push(F(VAL_CODES.BROKEN_REF, 'error', `${p}.${k}`, `reference "${ref}" is not defined in the payload, agents, or file system`, { ref, detail: `known ids in payload: ${[...ids].slice(0, 10).join(', ') || 'none'}` }));
          }
        }
      });
    }
  },
  {
    id: 'required-fields', label: 'required fields', severity: 'error',
    kinds: ['config', 'business-config', 'theme-config', 'workflow-output', 'agent-output', 'prompt-output'],
    check(ctx, findings) {
      const root = ctx.parsed ?? ctx.payload;
      const required = ctx.options.required;
      if (!Array.isArray(required) || required.length === 0 || !isObj(root)) return;
      for (const req of required) {
        const segs = String(req).replace(/^\$\.?/, '').split('.').filter(Boolean);
        let node = root;
        let ok = true;
        for (const seg of segs) {
          if (!isObj(node) && !Array.isArray(node)) { ok = false; break; }
          if (Array.isArray(node)) {
            if (!/^\d+$/.test(seg) || Number(seg) >= node.length) { ok = false; break; }
            node = node[Number(seg)];
          } else if (Object.prototype.hasOwnProperty.call(node, seg)) node = node[seg];
          else { ok = false; break; }
        }
        if (!ok || node === undefined || node === null) {
          findings.push(F(VAL_CODES.MISSING_FIELD, 'error', `$.${segs.join('.')}`, `missing required field "${segs.join('.')}"`));
        }
      }
    }
  },
  {
    id: 'schema-match', label: 'schema validation', severity: 'error',
    kinds: ['schema', 'config', 'agent-output'],
    check(ctx, findings) {
      const value = ctx.parsed ?? ctx.payload;
      let target = null;
      let label = null;
      if (ctx.options.schema && typeof ctx.options.schema === 'object') {
        target = ctx.options.schema;
      } else if (ctx.options.schemaFile && ctx.engine.validator) {
        try {
          target = ctx.engine.validator.loadFile(path.resolve(ctx.engine.root || '.', ctx.options.schemaFile));
          label = ctx.options.schemaFile;
        } catch {
          findings.push(F(VAL_CODES.CONFIG_INVALID, 'error', '$', `schema file could not be loaded: "${ctx.options.schemaFile}"`));
          return;
        }
      } else if (ctx.options.schemaTitle && ctx.engine.validator) {
        target = ctx.engine.validator.canonicalFor(ctx.options.schemaTitle);
        label = ctx.options.schemaTitle;
        if (!target) {
          findings.push(F(VAL_CODES.CONFIG_INVALID, 'error', '$', `no canonical schema matches "${ctx.options.schemaTitle}"`));
          return;
        }
      } else if (ctx.kind === 'schema') {
        findings.push(F(VAL_CODES.SCHEMA_MISSING, 'warning', '$', 'no schema provided; only structural checks ran'));
        return;
      } else {
        return;
      }
      const res = ctx.engine.validator.validate(value, target, { schemaPath: label });
      for (const err of res.errors) {
        findings.push(F(VAL_CODES.SCHEMA_MISMATCH, 'error', err.path, err.message, { detail: `schema: ${label || 'inline'}` }));
      }
    }
  },
  {
    id: 'asset-check', label: 'asset files and checksums', severity: 'error',
    kinds: ['asset', 'config', 'business-config', 'theme-config'],
    check(ctx, findings) {
      const root = ctx.parsed ?? ctx.payload;
      const baseDir = ctx.options.baseDir || '.';
      let entries = [];
      let container = '$';
      if (ctx.kind === 'asset') {
        if (Array.isArray(root)) entries = root;
        else if (isObj(root) && Array.isArray(root.files)) entries = root.files;
        else if (isObj(root)) entries = [root];
        else return;
      } else {
        const ap = ctx.options.assetsPath;
        if (!ap) return;
        const segs = String(ap).replace(/^\$\.?/, '').split('.').filter(Boolean);
        let node = root;
        for (const seg of segs) {
          if (node && typeof node === 'object' && seg in node) node = node[seg];
          else node = undefined;
        }
        if (node === undefined) {
          findings.push(F(VAL_CODES.MISSING_FIELD, 'error', `$.${segs.join('.')}`, `missing asset list at "${ap}"`));
          return;
        }
        container = `$.${segs.join('.')}`;
        entries = Array.isArray(node) ? node : [node];
      }
      entries.forEach((entry, idx) => {
        const base = `${container}[${idx}]`;
        if (!isObj(entry)) {
          findings.push(F(VAL_CODES.ASSET_INVALID, 'error', base, 'asset entry must be an object'));
          return;
        }
        const rel = entry.path ?? entry.relativePath;
        if (entry.isPlaceholder === true) {
          findings.push(F(VAL_CODES.ASSET_PLACEHOLDER, 'info', `${base}.path`, `asset "${rel ?? ''}" is a placeholder (expected missing)`, { ref: rel }));
          return;
        }
        if (typeof rel !== 'string' || rel.trim() === '') {
          findings.push(F(VAL_CODES.ASSET_INVALID, 'error', base, 'asset entry is missing "path"'));
          return;
        }
        const full = path.resolve(baseDir, rel);
        if (!fs.existsSync(full)) {
          findings.push(F(VAL_CODES.ASSET_MISSING, 'error', `${base}.path`, `asset file not found: "${rel}"`, { ref: rel }));
          return;
        }
        if (entry.checksum) {
          let buf;
          try { buf = fs.readFileSync(full); } catch (e) {
            findings.push(F(VAL_CODES.ASSET_MISSING, 'error', `${base}.path`, `unable to read asset "${rel}": ${e.message}`));
            return;
          }
          if (sha256(buf) !== entry.checksum) {
            findings.push(F(VAL_CODES.ASSET_CHECKSUM, 'error', `${base}.checksum`, `checksum mismatch for "${rel}"`, { ref: rel }));
          }
        }
        const ext = path.extname(rel).toLowerCase();
        const fmt = entry.format ? String(entry.format).toLowerCase() : null;
        if (fmt) {
          const allowed = FORMAT_EXTENSIONS[fmt];
          if (allowed && !allowed.includes(ext)) {
            findings.push(F(VAL_CODES.ASSET_MIME, 'error', `${base}.format`, `format "${entry.format}" does not match file extension "${ext}"`, { ref: rel }));
          }
        }
        if (fmt && entry.mime) {
          const expected = FORMAT_MIMES[fmt];
          if (expected && String(entry.mime).toLowerCase() !== expected) {
            findings.push(F(VAL_CODES.ASSET_MIME, 'error', `${base}.mime`, `mime "${entry.mime}" does not match format "${entry.format}" (expected ${expected})`, { ref: rel }));
          }
        }
      });
    }
  },
  {
    id: 'theme-rules', label: 'theme config contract', severity: 'error',
    kinds: ['theme-config'],
    check(ctx, findings) {
      const t = ctx.parsed ?? ctx.payload;
      if (!isObj(t)) return;
      if (typeof t.name !== 'string' || t.name.trim() === '') findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.name', 'missing required field "name"'));
      if (typeof t.storageKey !== 'string' || t.storageKey.trim() === '') findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.storageKey', 'missing required field "storageKey"'));
      const colors = t.colors;
      if (!isObj(colors)) {
        findings.push(F(VAL_CODES.THEME_INVALID, 'error', '$.colors', 'theme must define "colors" with light/dark modes'));
        return;
      }
      const modes = Object.keys(colors);
      if (modes.length === 0) findings.push(F(VAL_CODES.THEME_INVALID, 'error', '$.colors', 'no color modes defined'));
      if (typeof t.defaultMode === 'string' && !(t.defaultMode in colors)) {
        findings.push(F(VAL_CODES.THEME_INVALID, 'error', '$.defaultMode', `defaultMode "${t.defaultMode}" has no matching colors mode (${modes.join(', ') || 'none'})`));
      }
      for (const [mode, palette] of Object.entries(colors)) {
        if (!isObj(palette)) {
          findings.push(F(VAL_CODES.THEME_INVALID, 'error', `$.colors.${mode}`, `mode "${mode}" must be an object of color tokens`));
          continue;
        }
        for (const token of PALETTE_TOKENS) {
          const p = `$.colors.${mode}.${token}`;
          if (!Object.prototype.hasOwnProperty.call(palette, token)) {
            findings.push(F(VAL_CODES.MISSING_FIELD, 'error', p, `missing palette token "${token}" in mode "${mode}"`));
            continue;
          }
          const v = palette[token];
          if (typeof v !== 'string' || !/^\d{1,3} \d{1,3} \d{1,3}$/.test(v)) {
            findings.push(F(VAL_CODES.THEME_INVALID, 'error', p, `token "${token}" must be an "R G B" triplet, got ${JSON.stringify(v)}`));
            continue;
          }
          if (v.split(' ').some((ch) => Number(ch) > 255)) {
            findings.push(F(VAL_CODES.THEME_INVALID, 'error', p, `token "${token}" channel out of range (0-255): "${v}"`));
          }
        }
      }
      const typo = t.typography;
      if (!isObj(typo)) {
        findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.typography', 'missing required field "typography"'));
        return;
      }
      for (const key of ['display', 'body']) {
        if (typeof typo[key] !== 'string' || typo[key].trim() === '') {
          findings.push(F(VAL_CODES.MISSING_FIELD, 'error', `$.typography.${key}`, `missing required field "typography.${key}"`));
        }
      }
    }
  },
  {
    id: 'business-rules', label: 'business config contract', severity: 'error',
    kinds: ['business-config'],
    check(ctx, findings) {
      const b = ctx.parsed ?? ctx.payload;
      if (!isObj(b)) return;
      if (typeof b.name !== 'string' || b.name.trim() === '') findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.name', 'missing required field "name"'));
      if (typeof b.type !== 'string') findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.type', 'missing required field "type"'));
      else if (!BUSINESS_TYPES.includes(b.type)) {
        findings.push(F(VAL_CODES.BUSINESS_INVALID, 'error', '$.type', `unknown business type "${b.type}" (expected one of ${BUSINESS_TYPES.join(', ')})`));
      }
      const langs = b.languages;
      if (!Array.isArray(langs) || langs.length === 0 || langs.some((l) => typeof l !== 'string' || !l)) {
        findings.push(F(VAL_CODES.BUSINESS_INVALID, 'error', '$.languages', '"languages" must be a non-empty array of locale strings'));
      } else if (typeof b.locale === 'string' && !langs.includes(b.locale)) {
        findings.push(F(VAL_CODES.BUSINESS_INVALID, 'error', '$.locale', `locale "${b.locale}" is not listed in languages [${langs.join(', ')}]`));
      }
      if (typeof b.locale !== 'string') findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.locale', 'missing required field "locale"'));
      const sections = b.sections;
      if (!Array.isArray(sections) || sections.length === 0 || sections.some((s) => typeof s !== 'string' || !s)) {
        findings.push(F(VAL_CODES.BUSINESS_INVALID, 'error', '$.sections', '"sections" must be a non-empty array of section ids'));
      }
      if (b.currency !== undefined) {
        if (!isObj(b.currency)) findings.push(F(VAL_CODES.BUSINESS_INVALID, 'error', '$.currency', '"currency" must be an object'));
        else {
          for (const key of ['code', 'symbol']) {
            if (typeof b.currency[key] !== 'string' || !b.currency[key]) findings.push(F(VAL_CODES.MISSING_FIELD, 'error', `$.currency.${key}`, `missing required field "currency.${key}"`));
          }
          if (b.currency.position !== undefined && !['before', 'after'].includes(b.currency.position)) {
            findings.push(F(VAL_CODES.BUSINESS_INVALID, 'error', '$.currency.position', `currency position must be "before" or "after", got ${JSON.stringify(b.currency.position)}`));
          }
          if (b.currency.decimals !== undefined && (!Number.isInteger(b.currency.decimals) || b.currency.decimals < 0 || b.currency.decimals > 6)) {
            findings.push(F(VAL_CODES.BUSINESS_INVALID, 'error', '$.currency.decimals', 'currency decimals must be an integer 0-6'));
          }
        }
      }
      if (b.phoneDigits !== undefined && (!Number.isInteger(b.phoneDigits) || b.phoneDigits < 7)) {
        findings.push(F(VAL_CODES.BUSINESS_INVALID, 'error', '$.phoneDigits', `phoneDigits must be an integer >= 7, got ${JSON.stringify(b.phoneDigits)}`));
      }
    }
  },
  {
    id: 'prompt-rules', label: 'prompt output contract', severity: 'error',
    kinds: ['prompt-output'],
    check(ctx, findings) {
      const v = ctx.parsed ?? ctx.payload;
      if (typeof v === 'string') {
        findings.push(F(VAL_CODES.PROMPT_PLAIN, 'info', '$', 'plain-text prompt output accepted'));
        return;
      }
      if (!isObj(v)) {
        findings.push(F(VAL_CODES.PROMPT_INVALID, 'error', '$', 'prompt output must be a JSON object (or plain text)'));
        return;
      }
      if (typeof v.content !== 'string' || v.content.trim() === '') findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.content', 'missing required field "content"'));
      if (typeof v.model !== 'string' || v.model.trim() === '') findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.model', 'missing required field "model"'));
      if (v.usage !== undefined) {
        if (!isObj(v.usage)) findings.push(F(VAL_CODES.PROMPT_INVALID, 'error', '$.usage', '"usage" must be an object of token counts'));
        else {
          for (const key of Object.keys(v.usage)) {
            if (typeof v.usage[key] !== 'number' || !Number.isFinite(v.usage[key])) {
              findings.push(F(VAL_CODES.PROMPT_INVALID, 'error', `$.usage.${key}`, `usage.${key} must be a number, got ${JSON.stringify(v.usage[key])}`));
            }
          }
        }
      }
    }
  },
  {
    id: 'workflow-rules', label: 'workflow output contract', severity: 'error',
    kinds: ['workflow-output'],
    check(ctx, findings) {
      const w = ctx.parsed ?? ctx.payload;
      if (!isObj(w)) return;
      const docs = w.documents;
      if (docs === undefined) {
        findings.push(F(VAL_CODES.MISSING_FIELD, 'error', '$.documents', 'missing required field "documents"'));
        return;
      }
      const list = [];
      if (Array.isArray(docs)) docs.forEach((d, i) => list.push({ doc: d, path: `$.documents[${i}]` }));
      else if (isObj(docs)) for (const [k, d] of Object.entries(docs)) list.push({ doc: d, path: `$.documents.${k}` });
      else {
        findings.push(F(VAL_CODES.WORKFLOW_INVALID, 'error', '$.documents', '"documents" must be an object map or array'));
        return;
      }
      for (const { doc, path: p } of list) {
        if (!isObj(doc)) {
          findings.push(F(VAL_CODES.WORKFLOW_INVALID, 'error', p, 'document must be an object'));
          continue;
        }
        if (typeof doc.id !== 'string' || doc.id.trim() === '') findings.push(F(VAL_CODES.MISSING_FIELD, 'error', `${p}.id`, 'document is missing "id"'));
        const schemaRef = doc.schema;
        if (typeof schemaRef === 'string' && ctx.engine.validator && typeof ctx.engine.validator.canonicalFor === 'function') {
          const schema = ctx.engine.validator.canonicalFor(schemaRef);
          if (!schema) findings.push(F(VAL_CODES.BROKEN_REF, 'error', `${p}.schema`, `document schema "${schemaRef}" is not a canonical schema`, { ref: schemaRef }));
          else {
            const body = { ...doc };
            delete body.id;
            delete body.schema;
            const res = ctx.engine.validator.validate(body, schema, { schemaPath: schemaRef });
            for (const err of res.errors) {
              const suffix = err.path === '$' ? '' : err.path.slice(1);
              findings.push(F(VAL_CODES.SCHEMA_MISMATCH, 'error', `${p}${suffix}`, err.message, { detail: `schema: ${schemaRef}` }));
            }
          }
        }
      }
    }
  }
];
