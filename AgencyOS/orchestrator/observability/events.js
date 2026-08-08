export const ORC_EVENTS = {
  CAMPAIGN_STARTED: 'orchestrator.campaign_started',
  CAMPAIGN_PAUSED: 'orchestrator.campaign_paused',
  CAMPAIGN_RESUMED: 'orchestrator.campaign_resumed',
  CAMPAIGN_COMPLETED: 'orchestrator.campaign_completed',
  CAMPAIGN_STOPPED: 'orchestrator.campaign_stopped',
  CAMPAIGN_LIMITS_REACHED: 'orchestrator.limits_reached',
  EXECUTION_STARTED: 'orchestrator.execution_started',
  STEP_COMPLETED: 'orchestrator.step_completed',
  STEP_FAILED: 'orchestrator.step_failed',
  STEP_RETRYING: 'orchestrator.step_retrying',
  STATE_CHANGED: 'orchestrator.state_changed',
  APPROVAL_REQUIRED: 'orchestrator.approval_required',
  APPROVED: 'orchestrator.approved',
  DENIED: 'orchestrator.denied',
  DEPLOYED: 'orchestrator.deployed',
  FAILED: 'orchestrator.failed',
  ARCHIVED: 'orchestrator.archived',
  ROLLED_BACK: 'orchestrator.rolled_back',
  KILL_SWITCH: 'orchestrator.kill_switch'
};

export class OrchestratorEvents {
  constructor(bus = null) {
    this.bus = bus || null;
    this.listeners = new Map();
    this.ORC_EVENTS = ORC_EVENTS;
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(cb);
    return this;
  }

  off(event, cb) {
    const list = this.listeners.get(event) || [];
    this.listeners.set(event, list.filter((fn) => fn !== cb));
    return this;
  }

  emit(event, payload = {}) {
    for (const cb of this.listeners.get(event) || []) {
      try {
        cb(payload);
      } catch {
        /* listeners never break the orchestrator */
      }
    }
    if (this.bus && typeof this.bus.emitEvent === 'function') {
      try {
        this.bus.emitEvent(event, { module: 'orchestrator' }, payload);
      } catch {
        /* bus is best-effort */
      }
    } else if (this.bus && typeof this.bus.emit === 'function') {
      try {
        this.bus.emit(event, payload);
      } catch {
        /* bus is best-effort */
      }
    }
    return this;
  }

  clear() {
    this.listeners.clear();
  }
}
