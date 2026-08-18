import { buildHealthReport, buildIncidentReport } from '../tools/report.mjs';

const NOW = '2026-08-11T10:00:00.000Z';

// Fake engine mirroring the live snapshot surface (engine.snapshot() /
// event-sink statsSnapshot / incidents store). The health Sink table iterates
// Object.entries(snap.sink) including the `watermark` object cell.
const fakeEngine = {
  snapshot() {
    return {
      configVersion: 1,
      enabled: true,
      sink: {
        received: 21,
        written: 21,
        rejected: 0,
        dropped: 0,
        duplicates: 0,
        bufferLength: 0,
        lruSize: 0,
        lastEventAt: '2026-08-11T09:31:00.000Z',
        watermark: { file: '2026-08-11.ndjson', lastLine: 21, lastEventId: 'ev-21' },
        started: true
      },
      metrics: { registrySize: 3, rawFiles: 2, aggregates: 1, stats: { points: 30, duplicates: 0 } },
      events: { count: 21, days: 2 },
      experiments: { enabled: true, sets: 1, defaults: null },
      incidents: { open: 1, total: 1 },
      alerts: { active: 0, total: 2 },
      insights: { kinds: ['funnel'], total: 1 },
      jobs: { runs: 8, windows: 7, aborted: 0 },
      storageBytes: 8192
    };
  },
  incidents: {
    list: () => [
      {
        incidentId: 'inc-1',
        kind: 'delivery_failure',
        severity: 'high',
        status: 'open',
        scope: { type: 'delivery', id: 'biz-1' },
        count: 2,
        firstSeen: NOW,
        lastSeen: NOW,
        openedAt: NOW,
        resolvedAt: null,
        acknowledgedAt: null,
        resolvedBy: null,
        detail: 'provider refused',
        evidence: []
      }
    ],
    history: () => [{ at: NOW, event: 'OPENED', incidentId: 'inc-1', status: 'open' }]
  }
};

let pass = 0;
let fail = 0;
function assert(cond, label, extra = '') {
  if (cond) {
    pass++;
    console.log(`PASS ${label}`);
  } else {
    fail++;
    console.log(`FAIL ${label} ${extra}`);
  }
}

const health = buildHealthReport({ engine: fakeEngine, now: NOW });
const healthMd = health.markdown;
assert(!healthMd.includes('[object Object]'), 'health markdown free of coerced objects', healthMd);
assert(healthMd.includes('| watermark | {"file":"2026-08-11.ndjson","lastLine":21,"lastEventId":"ev-21"} |'), 'object table cell rendered as JSON', healthMd.split('\n').find((l) => l.includes('watermark')));
assert(healthMd.includes('# AgencyOS Intelligence — Health Report') && healthMd.includes('> System health: ingestion'), 'health summary blockquote intact');
assert(healthMd.includes('| points written | 30 |') && healthMd.includes('| runs | 8 |'), 'numeric cells intact');

const incident = buildIncidentReport({ engine: fakeEngine, now: NOW });
const incMd = incident.markdown;
assert(!incMd.includes('[object Object]'), 'incident markdown free of coerced objects', incMd);
assert(incMd.includes('> {"open":1,"acknowledged":0,"resolved":0,"closed":0}'), 'incident summary blockquote renders counts as JSON', incMd.split('\n')[2]);
assert(incMd.includes('| open | 1 |') && incMd.includes('| delivery:biz-1 |'), 'incident table rows intact', incMd);

console.log(`\nintelligence/report-markdown: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;