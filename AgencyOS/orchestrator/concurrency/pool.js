export class BoundedPool {
  constructor({ maxConcurrent = 4, onTaskStart = null, onTaskEnd = null } = {}) {
    this.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));
    this.queue = [];
    this.active = 0;
    this.stopped = false;
    this.draining = false;
    this.onTaskStart = onTaskStart || null;
    this.onTaskEnd = onTaskEnd || null;
    this._wake = null;
  }

  submit(task) {
    if (this.stopped) return Promise.reject(new Error('pool stopped'));
    return new Promise((resolve, reject) => {
      this.queue.push({ run: () => task(), resolve, reject });
      this._pump();
    });
  }

  _pump() {
    if (this._pumping) return;
    this._pumping = true;
    try {
      while (!this.stopped && this.active < this.maxConcurrent && this.queue.length) {
        const next = this.queue.shift();
        this.active++;
        this.onTaskStart?.(this.active);
        Promise.resolve()
          .then(next.run)
          .then((value) => next.resolve(value), (err) => next.reject(err))
          .finally(() => {
            this.active--;
            this.onTaskEnd?.(this.active);
            this._pump();
          });
      }
      if (this.active === 0 && (this.stopped || this.draining || !this.queue.length)) {
        if (this._wake) {
          const w = this._wake;
          this._wake = null;
          w();
        }
      }
    } finally {
      this._pumping = false;
    }
  }

  stopDispatching() {
    this.stopped = true;
  }

  setMax(n) {
    this.maxConcurrent = Math.max(1, Math.floor(n));
    this._pump();
  }

  async awaitIdle() {
    if (this.active === 0 && (this.stopped || this.draining || !this.queue.length)) return;
    if (this.active === 0) {
      this._pump();
      return;
    }
    await new Promise((resolve) => {
      this._wake = resolve;
    });
  }

  async drain() {
    this.draining = true;
    await this.awaitIdle();
  }

  pending() {
    return this.queue.length;
  }

  stats() {
    return { active: this.active, queued: this.queue.length, maxConcurrent: this.maxConcurrent, stopped: this.stopped };
  }
}
