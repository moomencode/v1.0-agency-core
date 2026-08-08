export class CandidateQueue {
  constructor({ maxBusinesses = 20 } = {}) {
    this.maxBusinesses = Math.max(0, Math.floor(maxBusinesses));
    this.byId = new Map();
    this.order = [];
  }

  add(candidates) {
    for (const record of Array.isArray(candidates) ? candidates : []) {
      if (!record || !record.id) continue;
      if (this.byId.has(record.id)) continue;
      const opportunity = record.scores && record.scores.opportunity ? record.scores.opportunity.value : 0;
      this.byId.set(record.id, { id: record.id, name: record.name, opportunity });
    }
    this.order = [...this.byId.values()].sort((a, b) => b.opportunity - a.opportunity || a.id.localeCompare(b.id));
    if (this.order.length > this.maxBusinesses) {
      this.order = this.order.slice(0, this.maxBusinesses);
      const kept = new Set(this.order.map((c) => c.id));
      for (const id of [...this.byId.keys()]) {
        if (!kept.has(id)) this.byId.delete(id);
      }
    }
  }

  items() {
    return this.order.map((c) => c.id);
  }

  has(id) {
    return this.byId.has(id);
  }

  dequeue() {
    const next = this.order.shift();
    if (!next) return null;
    this.byId.delete(next.id);
    return next.id;
  }

  peek() {
    return this.order.length ? this.order[0].id : null;
  }

  isEmpty() {
    return this.order.length === 0;
  }

  size() {
    return this.order.length;
  }

  restore(businessIds) {
    this.order = [];
    this.byId = new Map();
    for (const id of businessIds || []) {
      this.byId.set(id, { id, name: null, opportunity: 0 });
    }
    this.order = [...this.byId.values()];
  }
}
