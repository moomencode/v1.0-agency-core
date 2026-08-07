import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeJson, readJson, exists, listSorted } from '../utils.js';
import { deliveryError, DEL_CODES } from '../errors.js';

export class RecordStore {
  constructor({ root }) {
    this.dir = path.join(root, 'storage', 'delivery', 'records');
  }

  recordPath(recordId) {
    return path.join(this.dir, `${recordId}.json`);
  }

  save(record) {
    ensureDir(this.dir);
    writeJson(this.recordPath(record.id), record);
    return record;
  }

  load(recordId) {
    if (!exists(this.recordPath(recordId))) {
      throw deliveryError(DEL_CODES.UNKNOWN_RECORD, `no deployment record "${recordId}"`, { recordId });
    }
    return readJson(this.recordPath(recordId));
  }

  has(recordId) {
    return exists(this.recordPath(recordId));
  }

  list(businessId = null) {
    const records = [];
    for (const file of listSorted(this.dir)) {
      if (!file.endsWith('.json')) continue;
      const record = readJson(path.join(this.dir, file));
      if (!businessId || record.businessId === businessId) records.push(record);
    }
    return records.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
}
