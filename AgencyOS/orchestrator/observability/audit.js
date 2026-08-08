import fs from 'node:fs';
import path from 'node:path';
import { safeForLog } from '../../delivery/security/redaction.js';
import { ensureDir, nowIso } from '../utils.js';

export class AuditLog {
  constructor({ root = null, vault = null } = {}) {
    this.dir = root ? path.join(root, 'logs', 'orchestrator') : null;
    this.vault = vault || null;
  }

  append(entry) {
    if (!this.dir) return;
    try {
      ensureDir(this.dir);
      const day = nowIso().slice(0, 10);
      const line = { ...entry, at: entry.at || nowIso() };
      fs.appendFileSync(path.join(this.dir, `${day}.ndjson`), `${JSON.stringify(safeForLog(line, { vault: this.vault }))}\n`);
    } catch {
      /* audit is best effort */
    }
  }
}
