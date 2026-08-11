import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../../runtime/utils.js';
import { dateKey, readNdjson } from '../utils.js';

// Event log reader. The sink is the only writer; this store provides bounded,
// window-scoped reads for jobs and report tooling.
export class EventLog {
  constructor({ root }) {
    this.dir = path.join(root, 'events');
    ensureDir(this.dir);
  }

  fileFor(iso) {
    return path.join(this.dir, `${dateKey(iso)}.ndjson`);
  }

  dayFile(day) {
    return path.join(this.dir, `${day}.ndjson`);
  }

  days() {
    try {
      return fs.readdirSync(this.dir).filter((f) => f.endsWith('.ndjson')).map((f) => f.slice(0, 10)).sort();
    } catch {
      return [];
    }
  }

  // Read envelopes within [start, end). Bounded by the day range.
  read({ start = null, end = null, prefix = null, max = 20000 } = {}) {
    const files = [];
    for (const day of this.days()) {
      if (start && day < dateKey(start)) continue;
      if (end && day > dateKey(end)) continue;
      files.push(this.dayFile(day));
    }
    const out = [];
    for (const file of files) {
      for (const line of readNdjson(file)) {
        if (start && line.at < start) continue;
        if (end && line.at >= end) continue;
        if (prefix && !line.ev?.startsWith(prefix)) continue;
        out.push(line);
        if (out.length >= max) return out;
      }
    }
    out.sort((a, b) => (a.at === b.at ? String(a.ev).localeCompare(String(b.ev)) : a.at < b.at ? -1 : 1));
    return out;
  }

  count() {
    return this.days().reduce((acc, day) => acc + readNdjson(this.dayFile(day)).length, 0);
  }
}
