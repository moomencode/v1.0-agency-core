import { scanText } from './scan.js';

const REDACT_KEYS = /(token|secret|api[_-]?key|apikey|password|passwd|authorization|bearer|credential)/i;
const REDACTED = '[REDACTED]';

export function redactText(text, { vault = null } = {}) {
  let out = String(text);
  const matches = scanText(out);
  for (const m of matches) {
    out = out.split(m.snippet).join(REDACTED);
  }
  if (vault) {
    for (const known of vault.knownSecretValues()) {
      if (known && known.length >= 8 && out.includes(known)) out = out.split(known).join(REDACTED);
    }
  }
  return out;
}

export function redact(value, { vault = null } = {}) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, { vault }));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.test(k) ? REDACTED : redact(v, { vault });
    }
    return out;
  }
  if (typeof value === 'string') return redactText(value, { vault });
  return value;
}

export function safeForLog(value, { vault = null } = {}) {
  if (typeof value === 'string') return redactText(value, { vault });
  return JSON.stringify(redact(value, { vault }));
}
