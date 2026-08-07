import { parseHtml, check, groupPassed } from './html.js';

export function runSeoGroup(files) {
  const checks = [];
  const htmlPages = Object.keys(files)
    .filter((p) => p.endsWith('.html'))
    .sort();

  if (htmlPages.length === 0) {
    checks.push(check('seo:pages', false, ['no html pages in production tree']));
  } else {
    for (const page of htmlPages) {
      const doc = parseHtml(files[page]);
      checks.push(check(`seo:title:${page}`, Boolean(doc.title && doc.title.trim().length > 0), ['missing <title>']));
      checks.push(check(`seo:description:${page}`, Boolean(doc.metaDescription && doc.metaDescription.trim().length > 0), ['missing meta description']));
      checks.push(check(`seo:h1:${page}`, doc.h1Count === 1, [`expected exactly 1 <h1>, got ${doc.h1Count}`]));
      checks.push(check(`seo:canonical:${page}`, Boolean(doc.canonical), ['missing canonical link']));
      for (const [i, ld] of doc.ldJson.entries()) {
        let ok = true;
        const errs = [];
        try {
          const parsed = JSON.parse(ld);
          if (!parsed || typeof parsed !== 'object' || !parsed['@type']) {
            ok = false;
            errs.push('structured data missing @type');
          }
        } catch {
          ok = false;
          errs.push('structured data is not valid JSON');
        }
        checks.push(check(`seo:ldjson:${page}:${i}`, ok, errs));
      }
    }
  }

  const hasSitemap = 'sitemap.xml' in files;
  checks.push(check('seo:sitemap', hasSitemap, ['sitemap.xml missing']));
  if (hasSitemap) {
    const sitemap = String(files['sitemap.xml']);
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const missing = htmlPages.filter((p) => !listed.some((l) => l.endsWith(p)));
    checks.push(check('seo:sitemap:coverage', missing.length === 0, [`pages missing from sitemap: ${missing.join(', ')}`]));
  }
  checks.push(check('seo:robots', 'robots.txt' in files, ['robots.txt missing']));

  return { id: 'seo', checks, passed: groupPassed(checks) };
}
