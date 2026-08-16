import fs from 'node:fs';
import path from 'node:path';
import { assert, runTests, scratchRoot, baseSpec, createStack, createSystem, SIMULATED_ROWS } from './helpers.mjs';
import { sanitizeRunId } from '../../runtime/utils.js';
import { ContextManager } from '../../runtime/contextManager.js';
import { Logger } from '../../runtime/logger.js';
import { WorkflowRunner } from '../../runtime/workflowRunner.js';
import { AgentRunner } from '../../runtime/agentRunner.js';
import { PipelineRunner } from '../../pipeline/runner.js';
import { redactText } from '../../delivery/security/redaction.js';
import { SecretVault } from '../../delivery/security/secrets.js';
import { TraceCollector } from '../execution/trace.js';
import { AuditLog } from '../observability/audit.js';

const HOSTILE_IDS = ['..\\..\\escape-me', '.', '..', '..\\..\\..\\evil', '/etc/passwd', 'C:\\Windows\\system32', '%2e%2e%2f', 'a b/c', '..\\..\\..\\..\\..\\temp\\pwned'];

const HOSTILE = '..\\..\\escape-me';
const SAFE = sanitizeRunId(HOSTILE);

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function readAllText(files) {
  const chunks = [];
  for (const f of files) {
    try {
      chunks.push(fs.readFileSync(f, 'utf8'));
    } catch {
      /* binary or unreadable — skip */
    }
  }
  return chunks.join('\n');
}

const security = {
  'sanitizeRunId table: hostile inputs collapse to a single safe segment': () => {
    for (const hostile of HOSTILE_IDS) {
      const out = sanitizeRunId(hostile);
      assert(!out.includes('..'), `"${hostile}" must not contain ".." (got "${out}")`);
      assert(!out.includes('/') && !out.includes('\\'), `"${hostile}" must not contain path separators (got "${out}")`);
      assert(!out.startsWith('.'), `"${hostile}" must not start with dots (got "${out}")`);
      assert(out.length > 0 && out.length <= 96, `"${hostile}" must produce a bounded non-empty segment (got "${out}")`);
    }
    assert(sanitizeRunId('..') === 'run', 'bare ".." falls back to "run"');
    assert(sanitizeRunId('.') === 'run', 'bare "." falls back to "run"');
    assert(sanitizeRunId(null) === 'run', 'null falls back to "run"');
    assert(sanitizeRunId('') === 'run', 'empty falls back to "run"');
    assert(sanitizeRunId('a..b') === 'a.b', 'dot runs collapse');
    assert(sanitizeRunId('my-run-1') === 'my-run-1', 'legit ids pass through unchanged');
    assert(sanitizeRunId('run-abc123') === 'run-abc123', 'generated-style ids pass through unchanged');
    assert(sanitizeRunId('a'.repeat(200)).length === 96, 'oversized ids are capped at 96 chars');
  },

  'SEC-01: ContextManager.create replaces hostile runId with a fresh generated id': () => {
    const root = scratchRoot('sec-context');
    const cm = new ContextManager({ root });
    const ctx = cm.create({ workflowId: 'w1', input: {}, options: { runId: HOSTILE } });
    assert(ctx.runId !== HOSTILE, `runId must not be the hostile input (got ${ctx.runId})`);
    assert(!ctx.runId.includes('..') && !ctx.runId.includes('\\'), 'generated runId is a single safe segment');
    assert(fs.existsSync(path.join(root, 'storage', 'documents', 'runs', ctx.runId, 'context.json')), 'context.json written under runs dir');
    assert(!fs.existsSync(path.join(root, 'escape-me')), 'no escaped directory at root');
    assert(!fs.existsSync(path.join(root, 'storage', 'documents', 'runs', '..', '..', 'escape-me')), 'no traversal directory under runs');
  },

  'SEC-01: ContextManager preserves legit runIds unchanged': () => {
    const root = scratchRoot('sec-context-legit');
    const cm = new ContextManager({ root });
    const ctx = cm.create({ workflowId: 'w1', input: {}, options: { runId: 'my-run-42' } });
    assert(ctx.runId === 'my-run-42', `legit runId preserved (got ${ctx.runId})`);
    assert(fs.existsSync(path.join(root, 'storage', 'documents', 'runs', 'my-run-42', 'context.json')), 'legit run dir created');
  },

  'SEC-01: ContextManager.load with hostile runId is a safe no-op': () => {
    const root = scratchRoot('sec-context-load');
    const cm = new ContextManager({ root });
    const ctx = cm.create({ workflowId: 'w1', input: {}, options: { runId: 'legit-run' } });
    assert(ctx.runId === 'legit-run');
    const hostile = cm.load(HOSTILE);
    assert(hostile === null, 'hostile load returns null, never throws or traverses');
    assert(!fs.existsSync(path.join(root, 'escape-me')), 'no escaped directory');
  },

  'SEC-01: ContextManager.persist sanitizes even a legacy hostile context.runId': () => {
    const root = scratchRoot('sec-context-persist');
    const cm = new ContextManager({ root });
    const ctx = cm.create({ workflowId: 'w1', input: {}, options: { runId: 'legit-run' } });
    ctx.runId = HOSTILE;
    cm.persist(ctx);
    assert(fs.existsSync(path.join(root, 'storage', 'documents', 'runs', SAFE, 'context.json')), 'legacy hostile runId persisted to sanitized dir');
    assert(!fs.existsSync(path.join(root, 'escape-me')), 'no escaped directory');
    assert(!fs.existsSync(path.join(root, 'storage', 'documents', 'runs', '..', '..', 'escape-me')), 'no traversal directory');
  },

  'SEC-01: Logger never writes outside logs/runs even for hostile runId': () => {
    const root = scratchRoot('sec-logger');
    const lg = new Logger({ runId: HOSTILE, root });
    lg.info('boom', { x: 1 });
    return lg.close().then(() => {
      assert(fs.existsSync(path.join(root, 'logs', 'runs', `run-${SAFE}.ndjson`)), 'sink file at sanitized path');
      assert(!fs.existsSync(path.join(root, 'escape-me')), 'no escaped file');
      const lines = fs.readFileSync(path.join(root, 'logs', 'runs', `run-${SAFE}.ndjson`), 'utf8').trim().split('\n').filter(Boolean);
      assert(lines.length === 1, 'one line written');
      assert(JSON.parse(lines[0]).runId === SAFE, 'log record runId is the sanitized id');
    });
  },

  'SEC-01: WorkflowRunner._writeArtifacts stays under artifacts/runs for hostile runId': () => {
    const root = scratchRoot('sec-artifacts');
    const runner = new WorkflowRunner({ root });
    const context = {
      runId: HOSTILE,
      workflowId: 'w1',
      status: 'completed',
      startedAt: 't0',
      finishedAt: 't1',
      seed: 's',
      documents: {
        doc1: { version: 1, checksum: 'c1', workflowId: 'w1', stepId: 's1', value: { a: 1 } }
      }
    };
    runner._writeArtifacts(context);
    assert(fs.existsSync(path.join(root, 'storage', 'artifacts', 'runs', SAFE, 'doc1.json')), 'artifact at sanitized run dir');
    assert(!fs.existsSync(path.join(root, 'escape-me')), 'no escaped artifact dir');
    assert(!fs.existsSync(path.join(root, 'storage', 'artifacts', 'runs', '..', '..', 'escape-me')), 'no traversal artifact dir');
  },

  'SEC-01: AgentRunner._runCommand input file stays under storage/tmp': () => {
    const root = scratchRoot('sec-agent');
    const runner = new AgentRunner({ root });
    const agent = {
      id: 'hostile-agent',
      config: { command: ['node', '-e', 'process.stdout.write(JSON.stringify({ok:true}))'], timeoutSeconds: 30 }
    };
    const context = { runId: HOSTILE, workflowId: 'w1', seed: 's' };
    const output = runner._runCommand(agent, { hello: 'world' }, context, 'step1');
    assert(output.ok === true, 'command agent still executes');
    assert(fs.existsSync(path.join(root, 'storage', 'tmp', `hostile-agent-${SAFE}-step1.json`)), 'input file at sanitized tmp path');
    assert(!fs.existsSync(path.join(root, 'escape-me')), 'no escaped file');
    assert(!fs.existsSync(path.join(root, 'storage', 'tmp', '..', '..', 'escape-me')), 'no traversal in tmp');
  },

  'SEC-01: PipelineRunner._safeRunId blocks traversal and _saveCheckpoint stays contained': async () => {
    const root = scratchRoot('sec-pipeline');
    const pl = new PipelineRunner({ root });
    assert(pl._safeRunId('..') === 'run', 'bare ".." becomes "run"');
    assert(pl._safeRunId('.') === 'run', 'bare "." becomes "run"');
    assert(!pl._safeRunId(HOSTILE).includes('..'), 'hostile id collapses');
    await pl._saveCheckpoint(HOSTILE, 'validate', { ok: true });
    const cp = path.join(root, 'checkpoints', SAFE, 'validate.json');
    assert(fs.existsSync(cp), 'checkpoint written at sanitized path');
    const content = JSON.parse(fs.readFileSync(cp, 'utf8'));
    assert(content.ok === true, 'checkpoint payload intact');
    assert(!fs.existsSync(path.join(root, 'escape-me')), 'no escaped checkpoint dir');
    assert(!fs.existsSync(path.join(root, 'checkpoints', '..', '..', 'escape-me')), 'no traversal checkpoint dir');
  },

  'SEC-01 integration: campaign with hostile businessIds keeps every artifact contained': async () => {
    const root = scratchRoot('sec-campaign');
    const rows = SIMULATED_ROWS.slice(0, 2).map((r, i) => ({ ...r, id: i === 0 ? HOSTILE : '.' }));
    const stack = await createStack(root, { rows });
    const sys = createSystem(root, stack);
    await sys.boot();
    const spec = baseSpec({ maxBusinesses: 2 });
    const started = sys.startCampaign(spec);
    assert(started.campaignId.startsWith('cmp-'), 'campaign id is a deterministic cmp- hash');
    await sys.runCampaign(started.campaignId);

    let approvals;
    for (let i = 0; i < 40 && (!approvals || approvals.length < 2); i++) {
      approvals = sys.pendingApprovals().filter((a) => a.kind === 'DEPLOY');
      if (!approvals || approvals.length < 2) await new Promise((r) => setTimeout(r, 100));
    }
    assert(approvals && approvals.length === 2, `2 DEPLOY approvals pending despite hostile ids, got ${approvals && approvals.length}`);
    for (const rec of approvals) {
      const decided = sys.approve(rec.id, { by: 'sec-test', reason: 'containment' });
      assert(decided.decision.granted === true, 'approval granted');
    }
    const deadline = Date.now() + 60000;
    let summary;
    while (Date.now() < deadline) {
      summary = sys.status(started.campaignId);
      if (summary.state !== 'RUNNING') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert(summary.state === 'COMPLETED', `campaign completed with hostile ids, got ${summary.state}`);
    assert(summary.metrics.deployed === 2, `both hostile-id businesses deployed, got ${summary.metrics.deployed}`);

    const engineRoot = path.join(root, 'storage', 'orchestrator-engine');
    const instanceDirs = fs.readdirSync(path.join(engineRoot, 'instances'));
    assert(instanceDirs.length === 2, `2 instance dirs, got ${instanceDirs.length}`);
    for (const d of instanceDirs) {
      assert(/^orc-[a-f0-9]+$/.test(d), `instance dir is a hashed orc- id, got "${d}"`);
    }
    const campaignFiles = fs.readdirSync(path.join(engineRoot, 'campaigns'));
    assert(campaignFiles.length === 1 && /^cmp-[a-f0-9]+\.json$/.test(campaignFiles[0]), `campaign file is a hashed cmp- id, got ${campaignFiles[0]}`);
    const lockFiles = fs.readdirSync(path.join(engineRoot, 'locks'));
    for (const f of lockFiles) {
      assert(!f.includes('..') && !f.includes('\\') && !f.includes('/'), `lock file name is a safe segment, got "${f}"`);
    }
    const files = walkFiles(root);
    for (const f of files) {
      const rel = path.relative(root, f);
      assert(!rel.includes('..'), `no traversal path component on disk: ${rel}`);
      assert(!rel.includes('escape-me'), `no raw hostile id on disk: ${rel}`);
    }
    assert(!fs.existsSync(path.join(root, 'escape-me')), 'no escaped directory at scratch root');
    sys.close();
  },

  'SEC-01 integration: credential-bearing content is blocked by the shift-left secret scan, never deployed': async () => {
    const root = scratchRoot('sec-scan');
    const SECRET = 'sk-abcdefghijklmnop';
    const rows = [{ ...SIMULATED_ROWS[0], name: `Cairo Roast Coffee ${SECRET}` }];
    const stack = await createStack(root, { rows });
    const sys = createSystem(root, stack);
    await sys.boot();
    const started = sys.startCampaign(baseSpec({ maxBusinesses: 1 }));
    await sys.runCampaign(started.campaignId);
    const deadline = Date.now() + 90000;
    let summary;
    while (Date.now() < deadline) {
      summary = sys.status(started.campaignId);
      const exec = summary.executions[0];
      if (exec && (exec.status === 'QA_FAILED' || exec.status === 'FAILED' || exec.status === 'DENIED')) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const exec = summary.executions[0];
    // P1-1 shift-left: the dossier/pipeline boundary now rejects the content
    // before the final QA gate, so the execution ends FAILED instead of
    // QA_FAILED. The invariants below (nothing deployed, raw record retained,
    // logs clean) are unchanged and still enforced.
    assert(['QA_FAILED', 'FAILED', 'DENIED'].includes(exec && exec.status), `secret-bearing site must be blocked by the secret scan, got ${exec && exec.status} (campaign ${summary.state})`);
    assert(stack.delivery.history().length === 0, `nothing may be deployed when content embeds a credential, got ${stack.delivery.history().length} records`);

    const engineRoot = path.join(root, 'storage', 'orchestrator-engine');
    const instanceDir = fs.readdirSync(path.join(engineRoot, 'instances'))[0];
    const recordRaw = fs.readFileSync(path.join(engineRoot, 'instances', instanceDir, 'record.json'), 'utf8');
    assert(recordRaw.includes(SECRET), 'source record retained the raw credential (internal storage)');
    const logsDir = path.join(root, 'logs');
    const logFiles = walkFiles(logsDir);
    assert(logFiles.length > 0, 'log files exist to scan');
    const logText = readAllText(logFiles);
    assert(!logText.includes(SECRET), 'raw credential must never reach logs (logger + audit)');
    sys.close();
  },

  'TraceCollector + AuditLog redact vault-known secrets and known secret patterns': () => {
    const root = scratchRoot('sec-redact-units');
    const SECRET = 'sk-abcdefghijklmnop';
    const vault = new SecretVault({ env: { MY_API_TOKEN: SECRET } });

    const trace = new TraceCollector({ root: path.join(root, 'engine'), executionId: 'orc-unit-1', campaignId: 'cmp-unit-1', businessId: 'b1', vault });
    trace.append({ event: 'agent_output', detail: { content: `copy uses ${SECRET} and Bearer abcdefghijklmnopqrstuvwxyz1234567890` } });
    const traceFile = path.join(root, 'engine', 'instances', 'orc-unit-1', 'trace.ndjson');
    assert(fs.existsSync(traceFile), 'trace ndjson written');
    const traceText = fs.readFileSync(traceFile, 'utf8');
    assert(!traceText.includes(SECRET), 'vault-known secret redacted from trace');
    assert(traceText.includes('[REDACTED]'), 'trace contains redaction markers');
    assert(!traceText.includes('Bearer abcdefghijklmnopqrstuvwxyz1234567890'), 'known bearer pattern redacted from trace');

    const audit = new AuditLog({ root, vault });
    audit.append({ action: 'deploy', executionId: 'orc-unit-1', detail: { apiToken: SECRET } });
    const auditFile = fs.readdirSync(path.join(root, 'logs', 'orchestrator'))[0];
    const auditText = fs.readFileSync(path.join(root, 'logs', 'orchestrator', auditFile), 'utf8');
    assert(!auditText.includes(SECRET), 'vault-known secret redacted from audit');
    assert(auditText.includes('[REDACTED]'), 'audit contains redaction markers');
  },

  'redactText unit: known secret patterns are redacted': () => {
    assert(redactText('key=sk-abcdefghijklmnop') === 'key=[REDACTED]', 'known-prefix token redacted');
    assert(redactText('api_key=abc1234567890xyz') === '[REDACTED]', 'key-value secret redacted');
    assert(redactText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890') === 'Authorization: [REDACTED]', 'bearer token redacted');
    assert(redactText('plain hello world') === 'plain hello world', 'plain text untouched');
  }
};

async function main() {
  const ok = await runTests('security', security);
  process.exit(ok ? 0 : 1);
}

main();
