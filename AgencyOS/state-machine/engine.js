import { stmError, STM_CODES } from './errors.js';
import { STATES, START_STATE, END_STATES, stateDef, failureRule, TIMEOUT_ACTIONS } from './states.js';

export { STATES, START_STATE, END_STATES };

export class StateMachine {
  constructor({ validator = null, schema = null, clock = null } = {}) {
    this.validator = validator || null;
    this.schema = schema || null;
    this.clock = clock || (() => new Date().toISOString());
    this._now = () => this.clock();
  }

  states() {
    return Object.keys(STATES);
  }

  stateInfo(state) {
    return stateDef(state) || null;
  }

  transitions(from) {
    const def = stateDef(from);
    return def ? [...def.allowed] : [];
  }

  canTransition(from, to) {
    const def = stateDef(from);
    return !!def && def.allowed.includes(to);
  }

  create({ entityType = 'business', id = null } = {}) {
    const now = this._now();
    return {
      version: 1,
      id: id || `stm-${Date.now().toString(36)}`,
      entityType,
      current: START_STATE,
      history: [{ from: null, to: START_STATE, at: now, by: 'init', reason: 'execution created' }],
      attempts: {},
      createdAt: now,
      updatedAt: now,
      timeoutTriggered: false
    };
  }

  transition(instance, to, { by = 'system', reason = null, guard = null } = {}) {
    this._assertInstance(instance);
    if (!stateDef(to)) throw stmError(STM_CODES.UNKNOWN_STATE, `unknown target state "${to}"`);
    const from = instance.current;
    if (!this.canTransition(from, to)) {
      throw stmError(STM_CODES.ILLEGAL_TRANSITION, `illegal transition ${from} -> ${to}`, { from, to });
    }
    if (guard && !guard(instance)) {
      throw stmError(STM_CODES.ILLEGAL_TRANSITION, `guard rejected transition ${from} -> ${to}`, { from, to });
    }
    return this._do(instance, to, by, reason);
  }

  _do(instance, to, by, reason) {
    const from = instance.current;
    const key = `${from}>${to}`;
    instance.attempts[key] = (instance.attempts[key] || 0) + 1;
    instance.history.push({ from, to, at: this._now(), by, reason });
    instance.current = to;
    instance.updatedAt = this._now();
    instance.timeoutTriggered = false;
    return instance;
  }

  rollback(instance, target, { by = 'system', reason = null } = {}) {
    this._assertInstance(instance);
    if (!stateDef(target)) throw stmError(STM_CODES.UNKNOWN_STATE, `unknown rollback target "${target}"`);
    const def = stateDef(instance.current);
    const rollbackTargets = def.rollback || [];
    if (!rollbackTargets.includes(target)) {
      throw stmError(STM_CODES.ILLEGAL_TRANSITION, `rollback ${instance.current} -> ${target} not permitted`, { from: instance.current, to: target, rollbackTargets });
    }
    return this._do(instance, target, by, `rollback: ${reason}`);
  }

  fail(instance, { by = 'system', reason = null, retryable = true } = {}) {
    this._assertInstance(instance);
    const rule = failureRule(instance.current);
    const from = instance.current;
    const attemptKey = `${from}>RETRY`;
    const attempts = instance.attempts[attemptKey] || 0;
    if (retryable && (rule.action === 'retry' || rule.action === 'follow_up') && attempts < rule.maxRetries) {
      return this.transition(instance, 'RETRY', { by, reason: reason || `failure in ${from}, retry ${attempts + 1}/${rule.maxRetries}` });
    }
    return this.transition(instance, 'FAILED', { by, reason: reason || `failure in ${from}, retries exhausted` });
  }

  retryTo(instance, target, { by = 'system', reason = null } = {}) {
    this._assertInstance(instance);
    if (instance.current !== 'RETRY') throw stmError(STM_CODES.ILLEGAL_TRANSITION, `retryTo only valid from RETRY (current: ${instance.current})`);
    if (!this.canTransition('RETRY', target)) throw stmError(STM_CODES.ILLEGAL_TRANSITION, `RETRY -> ${target} not permitted`);
    return this.transition(instance, target, { by, reason: reason || `retry towards ${target}` });
  }

  applyTimeout(instance, elapsedMs, { by = 'system', reason = null } = {}) {
    this._assertInstance(instance);
    const def = stateDef(instance.current);
    if (!def || def.timeoutMs <= 0 || elapsedMs < def.timeoutMs) return instance;
    const action = def.timeoutAction;
    if (!TIMEOUT_ACTIONS.includes(action)) throw stmError(STM_CODES.INVALID_INSTANCE, `unknown timeout action "${action}"`);
    instance.timeoutTriggered = true;
    switch (action) {
      case 'archive':
        this.transition(instance, 'ARCHIVED', { by, reason: reason || `timeout in ${instance.current}` });
        instance.timeoutTriggered = true;
        return instance;
      case 'fail':
        this.transition(instance, 'FAILED', { by, reason: reason || `timeout in ${instance.current}` });
        instance.timeoutTriggered = true;
        return instance;
      case 'retry':
        this.fail(instance, { by, reason: reason || `timeout in ${instance.current}` });
        instance.timeoutTriggered = true;
        return instance;
      case 'escalate': {
        const esc = {
          escalated: true,
          from: instance.current,
          at: this._now(),
          by,
          reason: reason || `timeout escalation in ${instance.current}`
        };
        instance.escalation = instance.escalation || [];
        instance.escalation.push(esc);
        instance.updatedAt = this._now();
        return instance;
      }
      default: return instance;
    }
  }

  attempts(instance, from, to) {
    return instance.attempts[`${from}>${to}`] || 0;
  }

  summary(instance) {
    this._assertInstance(instance);
    return {
      id: instance.id,
      entityType: instance.entityType,
      current: instance.current,
      transitions: instance.history.length - 1,
      attempts: { ...instance.attempts },
      timeoutTriggered: instance.timeoutTriggered,
      escalated: (instance.escalation || []).length,
      updatedAt: instance.updatedAt
    };
  }

  validate(instance) {
    if (!this.validator || !this.schema) return { valid: true, errors: [] };
    return this.validator.validate(instance, this.schema, { schemaPath: 'brain:state-machine' });
  }

  _assertInstance(instance) {
    if (!instance || typeof instance !== 'object' || !instance.current || !Array.isArray(instance.history)) {
      throw stmError(STM_CODES.INVALID_INSTANCE, 'invalid state machine instance');
    }
  }
}

export function createStateMachine(opts) {
  return new StateMachine(opts);
}
