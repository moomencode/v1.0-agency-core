import { createHash } from 'node:crypto';
import { stableStringify, sanitizeRunId } from '../runtime/utils.js';

export function sha256(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : stableStringify(value))
    .digest('hex');
}

export function hex16(hash) {
  return hash.slice(0, 16);
}

// Deterministic identity helpers — every id is a pure function of its inputs so
// outputs are reproducible from inputs alone (no wall clock, no randomness).
export function eventIdFor(event, module, at, correlation, payload) {
  return `evt-${hex16(sha256(`${event}|${module}|${at}|${stableStringify(correlation || {})}|${stableStringify(payload || {})}`))}`;
}

export function windowKeyFor(kind, scopeType, scopeId, start, end) {
  return hex16(sha256(`${kind}|${scopeType}|${scopeId}|${start}|${end}`));
}

export function pointIdFor(eventId, metric, scopeType, scopeId) {
  return `mpt-${hex16(sha256(`${eventId}|${metric}|${scopeType}|${scopeId}`))}`;
}

export function incidentKeyFor(scopeType, scopeId, kind, subject) {
  return `inc-key-${hex16(sha256(`${scopeType}|${scopeId}|${kind}|${subject}`))}`;
}

export function incidentIdFor(key) {
  return `inc-${hex16(key)}`;
}

export function alertIdFor(ruleId, scopeType, scopeId, windowStart) {
  return `alr-${hex16(sha256(`${ruleId}|${scopeType}|${scopeId}|${windowStart}`))}`;
}

export function insightIdFor(kind, scopeType, scopeId, start, end) {
  return `ins-${hex16(sha256(`${kind}|${scopeType}|${scopeId}|${start}|${end}`))}`;
}

export function sanitizeScopeId(id) {
  return sanitizeRunId(id, 'scope');
}
