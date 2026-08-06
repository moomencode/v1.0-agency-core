import { comError, COM_CODES } from './errors.js';

export class Transport {
  constructor(name = 'abstract') {
    this.name = name;
  }

  async start() {}

  async send(record) {
    throw comError(COM_CODES.TRANSPORT_FAILURE, `transport "${this.name}" has no send implementation`);
  }

  async stop() {}
}

export class LocalTransport extends Transport {
  constructor({ handler = null } = {}) {
    super('local');
    this.handler = handler;
    this.sent = 0;
  }

  setHandler(handler) {
    this.handler = handler;
  }

  async send(record) {
    this.sent++;
    if (this.handler) await this.handler(record);
    return record;
  }
}
