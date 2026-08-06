import { DiscoveryEngine } from './engine.js';

export const DISCOVERY_API_VERSION = '1.0';

export class DiscoverySystem {
  constructor(opts = {}) {
    this.engine = new DiscoveryEngine(opts);
  }

  registerSource(source) { return this.engine.registerSource(source); }
  sources() { return this.engine.sources(); }
  source(id) { return this.engine.source(id); }
  validateQuery(query) { return this.engine.validateQuery(query); }
  discover(query, opts) { return this.engine.discover(query, opts); }
  detect(record) { return this.engine.detect(record); }
  score(record) { return this.engine.score(record); }
  validateRecord(record) { return this.engine.validateRecord(record); }
  report(record) { return this.engine.report(record); }
  save(record, opts) { return this.engine.save(record, opts); }
  run(query, opts) { return this.engine.run(query, opts); }
  load(id) { return this.engine.load(id); }
  list() { return this.engine.list(); }
  search(term, opts) { return this.engine.search(term, opts); }
  export(file) { return this.engine.export(file); }
  stats() { return this.engine.stats(); }
  weaknesses() { return this.engine.weaknesses(); }
  priorities() { return this.engine.priorities(); }
  close() { return this.engine.close(); }
}

export function createDiscoverySystem(opts) {
  return new DiscoverySystem(opts);
}
