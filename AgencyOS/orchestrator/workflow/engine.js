import { applyOrcTransition, canTransition, isTerminal } from '../state/machine.js';
import { classifyError } from '../failures/classifier.js';
import { stepFor, entryStateFor, STEP_INDEX } from './steps.js';
import { ensureDir, atomicWrite, readJson, nowIso, sleep } from '../utils.js';
import { instanceRoot } from '../utils.js';

function instanceFs(root) {
  return {
    write(execution, name, value) {
      ensureDir(instanceRoot(root, execution.executionId));
      atomicWrite(`${instanceRoot(root, execution.executionId)}/${name}`, JSON.stringify(value, null, 2));
    },
    read(execution, name) {
      return readJson(`${instanceRoot(root, execution.executionId)}/${name}`, null);
    }
  };
}

export function backoffMs(attempt, { initial = 200, cap = 5000 } = {}) {
  return Math.min(cap, initial * Math.pow(2, Math.max(0, attempt - 1)));
}

export class StepEngine {
  constructor({ root = null, approvals = null, budget = null, policy = null, events = null, audit = null, checkpoint = null, locks = null, killSwitch = null } = {}) {
    this.root = root;
    this.approvals = approvals;
    this.budget = budget;
    this.policy = policy;
    this.events = events;
    this.audit = audit;
    this.checkpoint = checkpoint;
    this.locks = locks;
    this.killSwitch = killSwitch;
  }

  buildDeps(execution, campaign) {
    return {
      campaign,
      approvals: this.approvals,
      budget: campaign._budget || this.budget,
      policy: this.policy,
      events: this.events,
      audit: this.audit,
      locks: this.locks,
      killSwitch: this.killSwitch,
      fs: instanceFs(this.root),
      trace: execution._trace
    };
  }

  async runExecution(execution, campaign, { adapters } = {}) {
    const deps = this.buildDeps(execution, campaign);
    deps.adapters = adapters;
    while (true) {
      if (this.killSwitch && this.killSwitch.isActive()) {
        execution.outcome = { verdict: 'STOPPED', reason: 'emergency stop' };
        this.checkpoint.save(execution);
        this.events?.emit(this.events.ORC_EVENTS.KILL_SWITCH, { executionId: execution.executionId, campaignId: campaign.id });
        this.audit?.append({ action: 'kill_switch', executionId: execution.executionId, campaignId: campaign.id });
        return { stopped: true, status: execution.status };
      }

      if (campaign && campaign._halted) {
        this.checkpoint.save(execution);
        return { halted: true, status: execution.status };
      }

      if (isTerminal(execution.status)) {
        return { completed: true, status: execution.status };
      }

      if (['ESCALATED', 'AWAITING_APPROVAL', 'QA_FAILED'].includes(execution.status)) {
        this.checkpoint.save(execution);
        return { waiting: true, state: execution.status };
      }

      const step = stepFor(execution.stepIndex);
      if (!step) {
        if (!isTerminal(execution.status)) {
          const err = classifyError(new Error('workflow ended without terminal state'), { phase: 'engine' });
          execution.error = err;
          if (canTransition(execution.status, 'FAIL')) applyOrcTransition(execution, 'FAIL', { step: 'engine' });
          this.checkpoint.save(execution);
        }
        return { completed: true, status: execution.status };
      }

      const exhausted = deps.budget.checkDuration({ executionStartedAt: execution.startedAt });
      if (exhausted.length) {
        this.checkpoint.save(execution);
        return { limitExhausted: exhausted, step: step.id };
      }

      const resolution = this.policy.resolve(campaign.autonomyLevel);
      if (!this.policy.stepIsAutomatic(step.id, resolution)) {
        const approval = this.approvals.request({
          executionId: execution.executionId,
          campaignId: campaign.id,
          kind: 'MANUAL_STEP',
          step: step.id,
          requestedBy: 'workflow'
        });
        if (!approval.decision) {
          this.checkpoint.save(execution);
          this.events?.emit(this.events.ORC_EVENTS.APPROVAL_REQUIRED, {
            approvalId: approval.id,
            executionId: execution.executionId,
            kind: 'MANUAL_STEP',
            step: step.id
          });
          this.audit?.append({ action: 'manual_step_required', approvalId: approval.id, executionId: execution.executionId, step: step.id });
          return { waiting: true, state: execution.status, approvalId: approval.id };
        }
      }

      const attempts = execution.attempts[step.id] || 0;
      try {
        const result = await step.run(execution, deps);
        execution.attempts[step.id] = 0;
        execution.error = null;
        if (result.outputs) Object.assign(execution.outputs, result.outputs);
        const stepEntry = entryStateFor(execution.stepIndex) || execution.status;
        if (result.terminal) {
          execution.status = stepEntry;
          if (canTransition(execution.status, 'FAIL')) applyOrcTransition(execution, 'FAIL', { step: step.id, reason: result.reason });
          execution.outcome = { verdict: 'FILTERED', reason: result.reason || null };
        } else if (result.event) {
          execution.status = stepEntry;
          applyOrcTransition(execution, result.event, { step: step.id });
        }
        if (!result.terminal && !result.event) {
          execution.timeline.push({ event: 'STEP', from: execution.status, to: execution.status, step: step.id, at: nowIso() });
        }
        execution.stepIndex++;
        this.checkpoint.save(execution);
        deps.budget.markStep();
        this.events?.emit(this.events.ORC_EVENTS.STATE_CHANGED, {
          executionId: execution.executionId,
          step: step.id,
          status: execution.status
        });
        this.events?.emit(this.events.ORC_EVENTS.STEP_COMPLETED, {
          executionId: execution.executionId,
          campaignId: campaign.id,
          step: step.id,
          status: execution.status
        });
        this.audit?.append({ action: 'step_completed', executionId: execution.executionId, step: step.id, status: execution.status });
        if (result.waiting) {
          this.checkpoint.save(execution);
          return { waiting: true, state: execution.status, approvalId: result.approvalId || null };
        }
      } catch (err) {
        const classified = classifyError(err, { phase: step.id });
        execution.error = classified;
        const attemptsUsed = (execution.attempts[step.id] || 0) + 1;
        const canRetry = step.retryable && classified.class === 'TRANSIENT' && attemptsUsed <= (campaign.budget.limits.maxRetries ?? 3);
        if (canRetry) {
          execution.attempts[step.id] = attemptsUsed;
          deps.budget.markRetry();
          if (canTransition(execution.status, 'RETRY')) applyOrcTransition(execution, 'RETRY', { step: step.id, attempt: attemptsUsed });
          this.checkpoint.save(execution);
          this.events?.emit(this.events.ORC_EVENTS.STEP_RETRYING, {
            executionId: execution.executionId,
            step: step.id,
            attempt: attemptsUsed,
            error: { class: classified.class, code: classified.code }
          });
          this.audit?.append({
            action: 'step_retrying',
            executionId: execution.executionId,
            step: step.id,
            attempt: attemptsUsed,
            errorClass: classified.class
          });
          await sleep(backoffMs(attemptsUsed));
          continue;
        }
        if (canTransition(execution.status, 'FAIL')) applyOrcTransition(execution, 'FAIL', { step: step.id, class: classified.class });
        execution.error = classified;
        execution.outcome = { verdict: 'FAILED', class: classified.class, code: classified.code, message: classified.message };
        this.checkpoint.save(execution);
        this.events?.emit(this.events.ORC_EVENTS.FAILED, {
          executionId: execution.executionId,
          campaignId: campaign.id,
          step: step.id,
          error: { class: classified.class, code: classified.code }
        });
        this.audit?.append({
          action: 'execution_failed',
          executionId: execution.executionId,
          step: step.id,
          errorClass: classified.class,
          errorCode: classified.code
        });
        return { failed: true, error: classified, step: step.id };
      }
    }
  }
}

export function createStepEngine(opts = {}) {
  return new StepEngine(opts);
}

export { STEP_INDEX };
