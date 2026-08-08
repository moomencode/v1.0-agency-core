import fs from 'node:fs';
import path from 'node:path';
import { Validator } from '../../runtime/validator.js';
import { orcError, ORC_CODES } from '../errors.js';

const MODULE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

export class ValidationService {
  constructor({ root = MODULE_ROOT } = {}) {
    this.schemasDir = path.join(root, 'schemas');
    this.validator = new Validator({ schemasDir: this.schemasDir });
    this.schemas = {};
    if (fs.existsSync(this.schemasDir)) {
      for (const file of fs.readdirSync(this.schemasDir)) {
        if (!file.endsWith('.schema.json')) continue;
        this.schemas[file.replace(/\.schema\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(this.schemasDir, file), 'utf8'));
      }
    }
  }

  validate(name, value) {
    const schema = this.schemas[name];
    if (!schema) return { valid: true, errors: [] };
    return this.validator.validate(value, schema, { schemaPath: `orchestrator:${name}` });
  }

  assertValid(name, value) {
    const check = this.validate(name, value);
    if (!check.valid) {
      throw orcError(ORC_CODES.SCHEMA_INVALID, `orchestrator "${name}" failed schema validation`, {
        errors: (check.errors || []).slice(0, 10),
        retryable: false
      });
    }
    return value;
  }
}

export function createValidationService(opts = {}) {
  return new ValidationService(opts);
}
