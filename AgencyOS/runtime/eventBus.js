import { EventEmitter } from 'node:events';

export const EVENTS = {
  RUN_STARTED: 'run_started',
  RUN_PAUSED: 'run_paused',
  RUN_COMPLETED: 'run_completed',
  RUN_ABORTED: 'run_aborted',
  STEP_STARTED: 'step_started',
  STEP_COMPLETED: 'step_completed',
  STAGE_UNAVAILABLE: 'stage_unavailable',
  EXTERNAL_STEP: 'external_step',
  AGENT_STARTED: 'agent_started',
  AGENT_COMPLETED: 'agent_completed',
  AGENT_FAILED: 'agent_failed',
  VALIDATED: 'validated',
  GATE_PASSED: 'gate_passed',
  GATE_FAILED: 'gate_failed',
  RETRY: 'retry',
  REJECTED: 'rejected',
  DOCUMENT_EMITTED: 'document_emitted'
};

export class EventBus {
  constructor(logger) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.logger = logger;
  }

  emitEvent(event, meta = {}, detail = null) {
    this.logger.info(event, detail, meta);
    this.emitter.emit(event, { event, ...meta, detail, ts: new Date().toISOString() });
  }

  on(event, handler) {
    this.emitter.on(event, handler);
    return this;
  }

  off(event, handler) {
    this.emitter.off(event, handler);
    return this;
  }
}

export function createEventBus(logger) {
  return new EventBus(logger);
}
