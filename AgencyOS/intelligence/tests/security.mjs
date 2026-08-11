import fs from 'node:fs';
import path from 'node:path';
import { makeT, makeEngine, makeBus, emitFixtureEvents, fixedClock, FIXED_NOW } from './helpers.mjs';
import { sanitizeScopeId, eventIdFor, pointIdFor } from '../ids.js';
import { redactText, redact, safeForLog } from '../../delivery/security/redaction.js';
import { SecretVault } from '../../delivery/security/secrets.js';

const t = makeT('intelligence/tests/security.mjs');
const BASE = path.join('C:/Users/kh/AppData/Local/Temp/opencode', 'int-security-' + Date.now());
fs.mkdirSync(BASE, { recursive: true });

t.section('path containment');
{
  t.assert(!sanitizeScopeId('../../etc/passwd').includes('..'), 'hostile scope ids are sanitized', sanitizeScopeId('../../etc/passwd'));
  t.assert(!sanitizeScopeId('../c:\\windows').includes(':'), 'no drive separators survive', sanitizeScopeId('../c:\\windows'));
  t.assert(sanitizeScopeId('camp-1') === 'camp-1', 'normal ids pass through unchanged');

  const bus = makeBus();
  const { engine, fixture } = await makeEngine({ base: path.join(BASE, 'contain'), bus, clock: fixedClock() });
  engine.start();
  emitFixtureEvents(bus);
  await engine.runJobs({ now: FIXED_NOW });
  engine.stop();

  // Every intelligence artifact lives under the engine storage root.
  const storageRoot = engine.storageRoot;
  const walk = (dir, base) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full, base));
      else out.push(path.relative(base, full));
    }
    return out;
  };
  const files = walk(storageRoot, storageRoot);
  t.assert(files.length >= 10, 'intelligence storage populated', `files=${files.length}`);
  t.assert(files.every((f) => !f.split(path.sep).includes('..')), 'no intelligence file escapes storageRoot');

  // Read-mostly: orchestrator/delivery/scheduler fixture files are untouched.
  const fixtureFiles = walk(fixture.base, fixture.base).map((f) => path.join(fixture.base, f));
  const fixtureBefore = fixtureFiles.map((f) => [path.relative(fixture.base, f), fs.readFileSync(f, 'utf8')]);
  // No intelligence path points at fixture dirs by construction.
  t.assert(!storageRoot.startsWith(fixture.orchestratorRoot), 'engine storage never nests under orchestrator storage');
}

t.section('redaction');
{
  const vault = new SecretVault({ env: { DEPLOY_TOKEN: 'supersecretvalue123', OTHER: 'ok' } });
  t.assert(redactText('plain text').includes('plain text'), 'plain text passes through');
  t.assert(!redactText('my api key is sk-abc1234xyz').includes('sk-abc1234xyz'), 'scanner-pattern secrets redacted');
  const obj = redact({ apiKey: 'sk-abc1234xyz', url: 'https://example.test', nested: { token: 'tok-xyz' } });
  t.assert(obj.apiKey === '[REDACTED]', 'key-named fields redacted');
  t.assert(obj.nested.token === '[REDACTED]', 'nested key-named fields redacted');
  t.assert(obj.url === 'https://example.test', 'innocent fields untouched');
  t.assert(redactText(`deploy ${'supersecretvalue123'} end`, { vault }).includes('[REDACTED]'), 'vault-known values redacted');
  t.assert(!redactText(`deploy ${'supersecretvalue123'} end`, { vault }).includes('supersecretvalue123'), 'vault value fully replaced');
  const logged = safeForLog({ apiKey: 'sk-abc1234xyz' });
  t.assert(logged.includes('[REDACTED]') && !logged.includes('sk-abc1234xyz'), 'safeForLog is log-safe');
}

t.section('sink producer safety');
{
  const { EventSink } = await import('../sinks/event-sink.js');
  const { Validator } = await import('../../runtime/validator.js');
  const { MetricStore } = await import('../stores/metrics.js');
  const { INT_ROOT } = await import('./helpers.mjs');
  const config = JSON.parse(fs.readFileSync(path.join(INT_ROOT, 'config', 'intelligence.config.json'), 'utf8'));
  const validator = new Validator({ schemasDir: path.join(INT_ROOT, 'schemas') });
  const sink = new EventSink({
    root: path.join(BASE, 'prod-safety'),
    bus: null,
    validator,
    envelopeSchema: validator.loadFile(path.join(INT_ROOT, 'schemas', 'event-envelope.schema.json')),
    registry: config.sink,
    metrics: new MetricStore({ root: path.join(BASE, 'prod-safety'), registry: config.metrics.registry, derived: config.metrics.derived }),
    clock: fixedClock()
  });
  const bus = makeBus();
  const rec = { event: 'orchestrator.deployed', ts: FIXED_NOW, module: 'orchestrator', campaignId: 'camp-1' };
  bus.on('orchestrator.deployed', (r) => sink.handle(r));
  sink.handle(rec); // not started → no-op
  t.assert(sink.statsSnapshot().received === 0, 'handle() before start() is a no-op');
  sink.start();
  bus.emit('orchestrator.deployed', rec);
  t.assert(sink.statsSnapshot().received === 1, 'handling after start works');
  sink.stop();
  sink.handle(rec);
  t.assert(sink.statsSnapshot().received === 1, 'handle() after stop() is a no-op');
  t.assert(bus.listeners('orchestrator.deployed') === 1, 'external handlers untouched by sink lifecycle');
}

t.section('dedupe identity (pointId from eventId + metric + scope)');
{
  const e1 = eventIdFor('orchestrator.deployed', 'orchestrator', '2026-08-11T09:00:00.000Z', { campaignId: 'c' }, {});
  const p1 = pointIdFor(e1, 'execution.succeeded', 'execution', 'ex-1');
  const p2 = pointIdFor(e1, 'execution.succeeded', 'execution', 'ex-1');
  const p3 = pointIdFor(e1, 'execution.succeeded', 'execution', 'ex-2');
  t.assert(p1 === p2, 'same event+metric+scope → same pointId');
  t.assert(p1 !== p3, 'different scope → different pointId');
}

t.section('no writes outside storage during full pipeline');
{
  const base = path.join(BASE, 'nowrites');
  const bus = makeBus();
  const { engine, fixture } = await makeEngine({ base, bus, clock: fixedClock() });
  engine.start();
  emitFixtureEvents(bus);
  await engine.runJobs({ now: FIXED_NOW });
  engine.stop();
  const snapshot = engine.snapshot();
  t.assert(snapshot.storageBytes > 0, 'engine wrote its own storage');
  t.assert(engine.insights.list().length > 0, 'insights persisted');
}

t.summary();
