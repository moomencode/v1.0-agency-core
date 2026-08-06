import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createValidator } from '../runtime/validator.js';
import { ValidationEngine } from './engine.js';
import { valError, VAL_CODES } from './errors.js';
import { toMarkdown } from './report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const VALIDATION_API_VERSION = '1.0';

export class ValidationSystem {
  constructor({ root = ROOT, schemasDir = null, logger = null } = {}) {
    this.root = path.resolve(root);
    this.schemasDir = schemasDir ? path.resolve(schemasDir) : path.join(this.root, 'schemas');
    this.validator = createValidator({ schemasDir: this.schemasDir, logger });
    this.engine = new ValidationEngine({ validator: this.validator, root: this.root });
    this.logger = logger;
    this.stats = { validations: 0, failures: 0 };
  }

  kinds() {
    return this.engine.kinds();
  }

  validate(kind, payload, options = {}) {
    const report = this.engine.run(kind, payload, {
      ...options,
      baseDir: options.baseDir ?? this.root,
      target: options.target ?? kind
    });
    this.stats.validations++;
    if (!report.valid) this.stats.failures++;
    if (this.logger) {
      this.logger.info('validated', { kind, valid: report.valid }, report.summary);
    }
    return report;
  }

  validateJson(text, options = {}) { return this.validate('json', text, options); }
  validateConfig(payload, options = {}) { return this.validate('config', payload, options); }
  validateBusinessConfig(payload, options = {}) { return this.validate('business-config', payload, options); }
  validateThemeConfig(payload, options = {}) { return this.validate('theme-config', payload, options); }
  validateWorkflowOutput(payload, options = {}) { return this.validate('workflow-output', payload, options); }
  validateAgentOutput(payload, options = {}) { return this.validate('agent-output', payload, options); }
  validatePromptOutput(payload, options = {}) { return this.validate('prompt-output', payload, options); }
  validateAsset(payload, options = {}) { return this.validate('asset', payload, options); }

  validateSchema(payload, schemaOrFile, options = {}) {
    const opts = { ...options };
    if (typeof schemaOrFile === 'string') opts.schemaFile = schemaOrFile;
    else if (schemaOrFile && typeof schemaOrFile === 'object') opts.schema = schemaOrFile;
    return this.validate('schema', payload, opts);
  }

  validateFile(kind, filePath, options = {}) {
    if (!fs.existsSync(filePath)) throw valError(VAL_CODES.ASSET_MISSING, `file not found: ${filePath}`, { filePath });
    const payload = fs.readFileSync(filePath, 'utf8');
    return this.validate(kind, payload, { ...options, target: options.target ?? filePath });
  }

  reportMarkdown(report) {
    return toMarkdown(report);
  }

  close() {
    this.validator = null;
  }
}

export function createValidationSystem(opts) {
  return new ValidationSystem(opts);
}
