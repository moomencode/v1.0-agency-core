import path from 'node:path';
import { atomicWrite, readJson } from '../../runtime/utils.js';
import { intError, INT_CODES } from '../errors.js';
import { windowsBetween } from '../utils.js';
import { sha256, hex16 } from '../ids.js';

const MARKER_JOB = 'intelligence:backfill';

// Explicit, resumable, idempotent recompute of insight windows over a
// requested range. Runs the registered job definitions directly (recompute-
// over-write semantics make every window final); progress is persisted in a
// job marker so a crash resumes from the next pending window. Never processes
// a future window. The killswitch aborts the remainder of a range.
export async function runBackfill({ jobSet, framework, ctx, from, to, jobs = null, maxWindows = 90, now = null } = {}) {
  if (!from || !to) throw intError(INT_CODES.UNKNOWN_JOB, 'backfill requires "from" and "to" ISO dates', {});
  if (new Date(from).getTime() >= new Date(to).getTime()) {
    throw intError(INT_CODES.INVALID_CONFIG, 'backfill "from" must precede "to"', { from, to });
  }
  const nowIso = now ? now : new Date().toISOString();
  const defs = new Map((jobSet || []).map((d) => [d.name, d]));
  const targets = jobs
    ? (Array.isArray(jobs) ? jobs : [jobs]).map((j) => String(j))
    : [...defs.keys()];
  for (const name of targets) {
    if (!defs.has(name)) throw intError(INT_CODES.UNKNOWN_JOB, `backfill: unknown job "${name}"`, { name });
  }

  const rangeKey = hex16(sha256(`${from}|${to}|${targets.sort().join(',')}|${maxWindows}`));
  const markerFile = path.join(framework.dir, `${MARKER_JOB.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
  const marker = readJson(markerFile, null);
  const current = marker && marker.rangeKey === rangeKey && marker.status !== 'aborted' ? marker : {
    schema: 'https://agency.os/intelligence/job-marker',
    jobId: MARKER_JOB,
    rangeKey,
    from,
    to,
    maxWindows,
    completed: [],
    lastWindowEnd: null,
    status: 'running',
    updatedAt: nowIso
  };
  if (marker && marker.rangeKey === rangeKey && marker.status === 'completed' && marker.completed.length === 0 && marker.from === from && marker.to === to) {
    return { name: MARKER_JOB, windows: 0, alreadyDone: true, jobs: targets, rangeKey };
  }

  const plan = [];
  for (const name of targets) {
    const def = defs.get(name);
    const windows = windowsBetween(from, to, def.windowMs, { maxWindows })
      .filter((w) => new Date(w.end).getTime() <= new Date(nowIso).getTime())
      .filter((w) => !current.completed.includes(`${name}|${w.start}`));
    plan.push({ name, windows, def });
  }

  let processed = 0;
  outer: for (const { name, windows, def } of plan) {
    for (const w of windows) {
      if (framework.killswitchActive()) {
        current.status = 'aborted';
        current.updatedAt = nowIso;
        atomicWrite(markerFile, JSON.stringify(current, null, 2));
        return { name: MARKER_JOB, windows: processed, aborted: true, jobs: targets, rangeKey };
      }
      await def.run({ window: w, now: nowIso, ctx });
      current.completed.push(`${name}|${w.start}`);
      current.lastWindowEnd = w.end;
      current.updatedAt = nowIso;
      atomicWrite(markerFile, JSON.stringify(current, null, 2));
      processed++;
    }
    if (processed >= maxWindows) {
      current.status = 'completed';
      current.updatedAt = nowIso;
      atomicWrite(markerFile, JSON.stringify(current, null, 2));
      break outer;
    }
  }
  current.status = 'completed';
  current.updatedAt = nowIso;
  atomicWrite(markerFile, JSON.stringify(current, null, 2));
  return { name: MARKER_JOB, windows: processed, jobs: targets, rangeKey };
}

export { MARKER_JOB };