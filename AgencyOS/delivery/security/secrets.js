import fs from 'node:fs';
import path from 'node:path';
import { deliveryError, DEL_CODES } from '../errors.js';

const ENV_FILE_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

function parseEnvFile(text) {
  const vars = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('export ')) {
      if (line.startsWith('export ')) {
        const m = line.slice(7).match(ENV_FILE_PATTERN);
        if (m) vars[m[1]] = stripQuotes(m[2]);
      }
      continue;
    }
    const m = line.match(ENV_FILE_PATTERN);
    if (m) vars[m[1]] = stripQuotes(m[2]);
  }
  return vars;
}

function stripQuotes(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export class SecretVault {
  constructor({ env = process.env, envPath = null, logger = null } = {}) {
    this.env = env;
    this.envPath = envPath || (env && env.DELIVERY_ENV_FILE ? env.DELIVERY_ENV_FILE : null);
    this.logger = logger;
    this.fileVars = null;
  }

  load() {
    if (this.fileVars !== null) return this.fileVars;
    this.fileVars = {};
    if (this.envPath && fs.existsSync(this.envPath)) {
      try {
        this.fileVars = parseEnvFile(fs.readFileSync(this.envPath, 'utf8'));
      } catch {
        this.fileVars = {};
      }
    }
    return this.fileVars;
  }

  get(name) {
    if (!name) return null;
    const fromEnv = this.env[name];
    if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
    const fromFile = this.load()[name];
    return fromFile !== undefined ? fromFile : null;
  }

  has(name) {
    return this.get(name) != null;
  }

  require(name) {
    const value = this.get(name);
    if (value == null) {
      throw deliveryError(DEL_CODES.SECRET_MISSING, `secret "${name}" is not configured`, {
        hint: 'provide it via the environment or a gitignored .env file; never commit credentials'
      });
    }
    return value;
  }

  knownSecretValues() {
    const values = [];
    for (const key of Object.keys(this.env)) {
      if (/token|secret|api_?key|password|passwd|auth/i.test(key) && this.env[key]) values.push(String(this.env[key]));
    }
    for (const [key, value] of Object.entries(this.load())) {
      if (/token|secret|api_?key|password|passwd|auth/i.test(key) && value) values.push(String(value));
    }
    return values;
  }
}
