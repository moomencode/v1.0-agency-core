export class JobQueue {
  constructor() {
    this.entries = [];
    this.seq = 0;
  }

  get size() {
    return this.entries.length;
  }

  enqueue(entry) {
    this.entries.push({ ...entry, seq: this.seq++ });
  }

  popEligible(now = Date.now()) {
    let bestIdx = -1;
    let best = null;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.dueAt > now) continue;
      if (!best || e.priority > best.priority || (e.priority === best.priority && e.seq < best.seq)) {
        best = e;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) this.entries.splice(bestIdx, 1);
    return best;
  }

  peek() {
    return this.entries.length ? this.entries[0] : null;
  }

  clear() {
    this.entries = [];
  }
}
