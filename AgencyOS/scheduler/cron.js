import { schError, SCH_CODES } from './errors.js';

const MONTH_NAMES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DAY_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const FIELD_DEFS = [
  { key: 'second', min: 0, max: 59, names: null },
  { key: 'minute', min: 0, max: 59, names: null },
  { key: 'hour', min: 0, max: 23, names: null },
  { key: 'dom', min: 1, max: 31, names: null },
  { key: 'month', min: 1, max: 12, names: MONTH_NAMES },
  { key: 'dow', min: 0, max: 7, names: DAY_NAMES }
];

function parseToken(token, def, fieldName, expr) {
  const { min, max, names } = def;
  const resolve = (t) => {
    const raw = t.trim().toLowerCase();
    if (raw === '?') return null;
    if (names && names[raw] !== undefined) return names[raw];
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      if (n < min || n > max) throw schError(SCH_CODES.CRON_INVALID, `cron field ${fieldName} value ${n} out of range ${min}-${max}`, { expr, field: fieldName });
      return n;
    }
    throw schError(SCH_CODES.CRON_INVALID, `cron field ${fieldName} token "${t}" is not a number${names ? ' or name' : ''}`, { expr, field: fieldName });
  };
  const values = new Set();
  for (const part of token.split(',')) {
    if (part.trim() === '') throw schError(SCH_CODES.CRON_INVALID, `empty element in cron field ${fieldName}`, { expr });
    let base = part;
    let step = null;
    const slash = part.indexOf('/');
    if (slash >= 0) {
      base = part.slice(0, slash);
      const stepTok = part.slice(slash + 1);
      if (!/^\d+$/.test(stepTok) || Number(stepTok) < 1) throw schError(SCH_CODES.CRON_INVALID, `invalid step "${stepTok}" in cron field ${fieldName}`, { expr });
      step = Number(stepTok);
    }
    if (base === '*' || base === '?') {
      if (step === null) {
        for (let v = min; v <= max; v++) values.add(v);
      } else {
        for (let v = min; v <= max; v += step) values.add(v);
      }
      continue;
    }
    let lo;
    let hi;
    const dash = base.indexOf('-');
    if (dash >= 0) {
      lo = resolve(base.slice(0, dash));
      hi = resolve(base.slice(dash + 1));
      if (lo > hi) throw schError(SCH_CODES.CRON_INVALID, `inverted range ${base} in cron field ${fieldName}`, { expr });
    } else {
      lo = resolve(base);
      hi = lo;
    }
    if (step === null) {
      for (let v = lo; v <= hi; v++) values.add(v);
    } else {
      for (let v = lo; v <= hi; v += step) values.add(v);
    }
  }
  return values;
}

export class CronSchedule {
  constructor(expr) {
    if (typeof expr !== 'string' || expr.trim() === '') {
      throw schError(SCH_CODES.CRON_INVALID, 'cron expression must be a non-empty string', { expr });
    }
    this.expr = expr.trim();
    const fields = this.expr.split(/\s+/);
    if (fields.length !== 5 && fields.length !== 6) {
      throw schError(SCH_CODES.CRON_INVALID, `cron expression must have 5 or 6 fields (second minute hour dom month dow), got ${fields.length}`, { expr });
    }
    const defs = fields.length === 6 ? FIELD_DEFS : FIELD_DEFS.slice(1);
    fields.forEach((token, i) => {
      const def = defs[i];
      const values = parseToken(token, def, def.key, this.expr);
      this[def.key] = values;
    });
    this.hasSeconds = fields.length === 6;
  }

  matches(date) {
    const t = date instanceof Date ? new Date(date) : new Date(date);
    const dom = t.getDate();
    const month = t.getMonth() + 1;
    const dow = t.getDay();
    const domAll = this.dom.size === 31;
    const dowAll = this.dow.size >= 7;
    const domOk = domAll || this.dom.has(dom);
    const dowOk = dowAll || this.dow.has(dow) || (dow === 0 && this.dow.has(7));
    const dayOk = (domAll && dowAll) ? true : domAll ? dowOk : dowAll ? domOk : (domOk || dowOk);
    return (
      this.month.has(month) &&
      dayOk &&
      this.hour.has(t.getHours()) &&
      this.minute.has(t.getMinutes()) &&
      (!this.hasSeconds || this.second.has(t.getSeconds()))
    );
  }

  nextRunAt(from = new Date()) {
    const start = new Date(from);
    // Minute-granular expressions start searching at the next minute boundary
    // (a 5-field cron matches any second within its minute — starting at
    // now+1s would make the "next" run land in the current minute and repeat
    // every second instead of once per minute).
    if (this.hasSeconds) {
      start.setSeconds(start.getSeconds() + 1, 0);
    } else {
      start.setSeconds(0, 0);
      start.setTime(start.getTime() + 60000);
    }
    const stepMs = this.hasSeconds ? 1000 : 60000;
    const maxSteps = this.hasSeconds ? 31_536_000 : 2_000_000;
    for (let i = 0; i < maxSteps; i++) {
      if (this.matches(start)) return start;
      start.setTime(start.getTime() + stepMs);
    }
    return null;
  }

  toSummary() {
    const fmt = (set, allSize) => (set.size >= allSize ? '*' : [...set].slice(0, 6).join(',') + (set.size > 6 ? '...' : ''));
    const parts = [`minute ${fmt(this.minute, 60)}`, `hour ${fmt(this.hour, 24)}`];
    if (this.hasSeconds) parts.unshift(`second ${fmt(this.second, 60)}`);
    if (this.month.size !== 12) parts.push(`month ${fmt(this.month, 12)}`);
    if (this.dom.size !== 31 || this.dow.size !== 8) parts.push(`days ${fmt(this.dom, 31)}/${fmt(this.dow, 8)}`);
    return `cron '${this.expr}' (${parts.join(', ')})`;
  }
}

export function parseCron(expr) {
  return new CronSchedule(expr);
}
