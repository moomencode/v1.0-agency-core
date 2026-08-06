import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify, readJson, ensureDir, writeJson } from './utils.js';
import { typedError, CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function deepEqual(a, b) {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return stableStringify(a) === stableStringify(b);
  }
  return Object.is(a, b);
}

const FORMATS = {
  'date-time': (v) =>
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(v) &&
    !Number.isNaN(Date.parse(v)),
  date: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v),
  uri: (v) => typeof v === 'string' && /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(v),
  email: (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
};

function typeName(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function resolveRef(root, ref, path) {
  if (ref === '#') return root;
  if (ref.startsWith('#/')) {
    let node = root;
    for (const seg of ref.slice(2).split('/')) {
      if (node === undefined || node === null) return undefined;
      node = node[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    return node;
  }
  return undefined;
}

function validateNode(node, schema, root, path, errors, depth = 0) {
  if (depth > 64) {
    errors.push({ path, message: 'schema nesting too deep' });
    return;
  }

  if (schema.$ref) {
    const target = resolveRef(root, schema.$ref, path);
    if (!target) {
      errors.push({ path, message: `unresolved $ref ${schema.$ref}` });
      return;
    }
    validateNode(node, target, root, path, errors, depth + 1);
    return;
  }

  if (schema.allOf) {
    for (const sub of schema.allOf) validateNode(node, sub, root, path, errors, depth + 1);
    return;
  }

  if (schema.anyOf || schema.oneOf) {
    const subs = schema.anyOf || schema.oneOf;
    const matches = [];
    for (const sub of subs) {
      const subErrors = [];
      validateNode(node, sub, root, path, subErrors, depth + 1);
      if (subErrors.length === 0) matches.push(sub);
    }
    if (schema.oneOf) {
      if (matches.length !== 1) errors.push({ path, message: 'value must match exactly one subschema' });
      return;
    }
    if (matches.length === 0) errors.push({ path, message: 'value must match at least one subschema' });
    return;
  }

  if (schema.not) {
    const subErrors = [];
    validateNode(node, schema.not, root, path, subErrors, depth + 1);
    if (subErrors.length === 0) errors.push({ path, message: 'value matches forbidden subschema' });
    return;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some((t) => {
      if (t === 'integer') return Number.isInteger(node);
      if (t === 'number') return typeof node === 'number';
      return typeName(node) === t;
    });
    if (!ok) {
      errors.push({ path, message: `expected type ${schema.type}, got ${typeName(node)}` });
      return;
    }
  }

  if (schema.const !== undefined && !deepEqual(schema.const, node)) {
    errors.push({ path, message: `expected const ${JSON.stringify(schema.const)}` });
  }

  if (schema.enum && !schema.enum.some((e) => deepEqual(e, node))) {
    errors.push({ path, message: `value not in enum [${schema.enum.join(', ')}]` });
  }

  if (typeof node === 'string') {
    if (schema.minLength !== undefined && [...node].length < schema.minLength) {
      errors.push({ path, message: `shorter than minLength ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && [...node].length > schema.maxLength) {
      errors.push({ path, message: `longer than maxLength ${schema.maxLength}` });
    }
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(node)) {
          errors.push({ path, message: `does not match pattern ${schema.pattern}` });
        }
      } catch {
        errors.push({ path, message: `invalid pattern ${schema.pattern}` });
      }
    }
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format](node)) {
      errors.push({ path, message: `invalid format ${schema.format}` });
    }
  }

  if (typeof node === 'number') {
    if (schema.minimum !== undefined && node < schema.minimum) {
      errors.push({ path, message: `less than minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && node > schema.maximum) {
      errors.push({ path, message: `greater than maximum ${schema.maximum}` });
    }
    if (schema.exclusiveMinimum !== undefined) {
      const bound = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum : schema.minimum;
      if (node <= bound) errors.push({ path, message: `not greater than exclusiveMinimum ${bound}` });
    }
    if (schema.exclusiveMaximum !== undefined) {
      const bound = typeof schema.exclusiveMaximum === 'number' ? schema.exclusiveMaximum : schema.maximum;
      if (node >= bound) errors.push({ path, message: `not less than exclusiveMaximum ${bound}` });
    }
  }

  if (Array.isArray(node)) {
    if (schema.minItems !== undefined && node.length < schema.minItems) {
      errors.push({ path, message: `fewer than minItems ${schema.minItems}` });
    }
    if (schema.maxItems !== undefined && node.length > schema.maxItems) {
      errors.push({ path, message: `more than maxItems ${schema.maxItems}` });
    }
    if (schema.uniqueItems && new Set(node).size !== node.length) {
      errors.push({ path, message: 'items are not unique' });
    }
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        node.forEach((item, i) => {
          const sub = schema.items[i] || {};
          validateNode(item, sub, root, `${path}[${i}]`, errors, depth + 1);
        });
      } else {
        node.forEach((item, i) => {
          validateNode(item, schema.items, root, `${path}[${i}]`, errors, depth + 1);
        });
      }
    }
  }

  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    const props = schema.properties || {};
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in node)) {
          errors.push({ path: `${path}.${key}`, message: `missing required property "${key}"` });
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        validateNode(value, props[key], root, `${path}.${key}`, errors, depth + 1);
      } else if (schema.additionalProperties === false) {
        errors.push({ path: `${path}.${key}`, message: `additional property "${key}" not allowed` });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateNode(value, schema.additionalProperties, root, `${path}.${key}`, errors, depth + 1);
      }
    }
  }
}

export class Validator {
  constructor({ schemasDir = path.join(ROOT, 'schemas'), logger = null } = {}) {
    this.schemasDir = schemasDir;
    this.logger = logger;
    this.schemaCache = new Map();
    this.canonicalIndex = null;
    this.stats = { validations: 0, failures: 0 };
  }

  compile(schema) {
    return schema;
  }

  validate(value, schema, { schemaPath = null } = {}) {
    this.stats.validations++;
    const errors = [];
    if (!schema || typeof schema !== 'object') {
      errors.push({ path: '$', message: 'schema is not an object' });
      return { valid: false, errors, value };
    }
    validateNode(value, schema, schema, '$', errors);
    if (errors.length > 0) this.stats.failures++;
    if (this.logger) {
      this.logger.info('validated', { valid: errors.length === 0, errors: errors.length, schemaPath }, { validations: this.stats.validations });
    }
    return { valid: errors.length === 0, errors, value };
  }

  loadFile(filePath) {
    const resolved = path.resolve(filePath);
    if (this.schemaCache.has(resolved)) return this.schemaCache.get(resolved);
    const schema = readJson(resolved, null);
    if (!schema) throw typedError(CODES.INFRA_STORAGE, `schema not found or invalid: ${filePath}`, { filePath });
    this.schemaCache.set(resolved, schema);
    return schema;
  }

  fingerprint(schema) {
    return stableStringify(schema);
  }

  loadCanonicalIndex() {
    if (this.canonicalIndex) return this.canonicalIndex;
    const index = new Map();
    if (fs.existsSync(this.schemasDir)) {
      for (const file of fs.readdirSync(this.schemasDir)) {
        if (!file.endsWith('.schema.json')) continue;
        const schema = this.loadFile(path.join(this.schemasDir, file));
        if (!schema || typeof schema !== 'object') continue;
        const title = schema.title ? String(schema.title).toLowerCase() : file.replace('.schema.json', '').toLowerCase();
        index.set(title, { file: path.join(this.schemasDir, file), schema });
      }
    }
    this.canonicalIndex = index;
    return index;
  }

  canonicalFor(title) {
    const index = this.loadCanonicalIndex();
    if (!title) return null;
    const key = String(title).toLowerCase();
    const fileKey = key.replace(/[^a-z0-9]+/g, '').replace('dossier', '');
    for (const [name, entry] of index) {
      if (name === key) return entry.schema;
      const normName = name.replace(/[^a-z0-9]+/g, '');
      if (normName === fileKey || normName.includes(fileKey)) return entry.schema;
    }
    return null;
  }

  assertValid(value, schema, { schemaPath = null, label = 'document' } = {}) {
    const result = this.validate(value, schema, { schemaPath });
    if (!result.valid) {
      throw typedError(CODES.VALIDATION_SCHEMA, `${label} failed schema validation (${schemaPath || 'inline'}): ${result.errors[0]?.message || 'invalid'}`, {
        schemaPath,
        errors: result.errors.slice(0, 20)
      });
    }
    return result;
  }
}

export function createValidator(opts) {
  return new Validator(opts);
}
