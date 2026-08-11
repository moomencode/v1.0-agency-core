import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, sanitizeRunId } from './utils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

export class Logger {
  constructor({ runId = 'global', level = 'info', root = ROOT } = {}) {
    // SEC-01: a caller-supplied runId must never become a path segment.
    this.runId = sanitizeRunId(runId);
    this.level = level;
    this.buffer = [];
    this.runsDir = ensureDir(path.join(root, 'logs', 'runs'));
    this.dailyDir = ensureDir(path.join(root, 'logs', 'daily'));
    this.sink = null;
    this.daily = null;
    try {
      this.sink = fs.createWriteStream(path.join(this.runsDir, `run-${this.runId}.ndjson`), { flags: 'a', fd: fs.openSync(path.join(this.runsDir, `run-${this.runId}.ndjson`), 'a') });
      this.sink.on('error', () => { this.sink = null; });
      const stamp = new Date().toISOString().slice(0, 10);
      this.daily = fs.createWriteStream(path.join(this.dailyDir, `${stamp}.ndjson`), { flags: 'a', fd: fs.openSync(path.join(this.dailyDir, `${stamp}.ndjson`), 'a') });
      this.daily.on('error', () => { this.daily = null; });
    } catch {
      this.sink = null;
      this.daily = null;
    }
  }

  _write(level, event, detail = null, meta = {}) {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      runId: this.runId,
      event,
      ...meta,
      detail
    };
    this.buffer.push(line);
    if (this.buffer.length > 5000) this.buffer.shift();
    if (this.sink) this.sink.write(JSON.stringify(line) + '\n');
    if (this.daily) this.daily.write(JSON.stringify(line) + '\n');
    if (level === 'fatal') console.error(JSON.stringify(line));
  }

  debug(event, detail, meta) { this._write('debug', event, detail, meta); }
  info(event, detail, meta) { this._write('info', event, detail, meta); }
  warn(event, detail, meta) { this._write('warn', event, detail, meta); }
  error(event, detail, meta) { this._write('error', event, detail, meta); }
  fatal(event, detail, meta) { this._write('fatal', event, detail, meta); }

  events() {
    return this.buffer;
  }

  child(runId) {
    return new Logger({ runId, level: this.level, root: path.resolve(this.runsDir, '..', '..') });
  }

  close() {
    const done = [];
    if (this.sink) done.push(new Promise((resolve) => this.sink.end(resolve)));
    if (this.daily) done.push(new Promise((resolve) => this.daily.end(resolve)));
    this.sink = null;
    this.daily = null;
    return Promise.all(done).then(() => undefined);
  }
}

export function createLogger(opts) {
  return new Logger(opts);
}
