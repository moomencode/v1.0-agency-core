import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../utils.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function scratchRoot(name) {
  const dir = path.join(ROOT, 'storage', 'delivery-tests', name);
  fs.rmSync(dir, { recursive: true, force: true });
  return dir;
}

export function cleanSite(businessId, { version = 1, runId = `run-test-${businessId}`, theme = null } = {}) {
  const colors = theme || {
    light: { ink: '#111111', base: '#ffffff' }
  };
  const site = {
    businessId,
    name: businessId,
    engineVersion: 'test-engine-1.0',
    theme: { colors },
    pages: [
      { path: 'index.html', id: 'home', ok: true, checks: [] },
      { path: 'about.html', id: 'about', ok: true, checks: [] }
    ]
  };
  const page = (pathName, title, hrefs = [], srcs = []) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${title} description for seo">
<link rel="canonical" href="https://agency.test/${pathName}">
<script type="application/ld+json">{"@type":"LocalBusiness","name":"${title}"}</script>
</head>
<body>
<header><nav><a href="index.html">Home</a><a href="about.html">About</a></nav></header>
<main><h1>${title}</h1>
<img src="img/hero.jpg" alt="hero image">
<h2 id="contact">Contact</h2>
<a href="#contact">Contact link</a>
${hrefs.map((h) => `<a href="${h}">${h}</a>`).join('\n')}
${srcs.map((s) => `<img src="${s}" alt="pic">`).join('\n')}
</main>
<footer>footer</footer>
</body>
</html>
`;
  const files = {
    'index.html': page('index.html', `${businessId} home`, ['https://agency.test/']),
    'about.html': page('about.html', `${businessId} about`),
    'img/hero.jpg': 'fake-jpeg-bytes',
    'assets/site.css': '.hero { background: url("img/hero.jpg"); }',
    'sitemap.xml': `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://agency.test/index.html</loc></url><url><loc>https://agency.test/about.html</loc></url></urlset>`,
    'robots.txt': 'User-agent: *\nAllow: /\n'
  };
  const validation = {
    passed: true,
    totals: { checks: 3, passed: 3, failed: 0 },
    pages: site.pages
  };
  return {
    site,
    files,
    validation,
    trace: { dossierVersion: version, pipelineRunId: runId }
  };
}

export function fakeEngine(filesFor = () => null) {
  return {
    export(site, { format = 'static' } = {}) {
      if (format !== 'static') throw new Error('test engine only supports static export');
      return filesFor(site) || site.__files || {};
    }
  };
}

export function buildRecordFor({ buildId, businessId, files, trace, checksum }) {
  return {
    schema: 'https://agency.os/delivery/build-record',
    buildId,
    businessId,
    engineVersion: 'test-engine-1.0',
    trace: { businessId, dossierVersion: String(trace.dossierVersion), pipelineRunId: String(trace.pipelineRunId) },
    engineOutputChecksum: checksum,
    files: Object.keys(files)
      .sort()
      .map((p) => ({ path: p, sha256: sha256(files[p]), bytes: Buffer.byteLength(files[p], 'utf8') })),
    fileCount: Object.keys(files).length,
    budget: { totalBytes: 1, gzipBytes: 1, passed: true },
    createdAt: new Date().toISOString()
  };
}

export function assert(cond, label) {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
}

export async function runTests(name, tests) {
  let pass = 0;
  let fail = 0;
  const failures = [];
  for (const [label, fn] of tests) {
    try {
      await fn();
      pass++;
      console.log(`PASS ${name}: ${label}`);
    } catch (err) {
      fail++;
      failures.push({ label, err });
      console.log(`FAIL ${name}: ${label} -> ${err.message}`);
    }
  }
  console.log(`${name}: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) {
    for (const f of failures) console.log(`  - ${f.label}: ${f.err.message}`);
    process.exitCode = 1;
  }
  return { pass, fail };
}
