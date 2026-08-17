export function parseHtml(html) {
  const content = String(html);
  const extract = (re) => {
    const m = content.match(re);
    return m ? m[1] : null;
  };
  return {
    title: extract(/<title[^>]*>([\s\S]*?)<\/title>/i),
    metaDescription: extract(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i),
    canonical: extract(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i),
    h1Count: (content.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || []).length,
    ids: [...content.matchAll(/<[a-z][^>]*\bid=["']([^"']+)["']/gi)].map((m) => m[1]),
    imgCount: (content.match(/<img\b[^>]*>/gi) || []).length,
    imgsWithoutAlt: [...content.matchAll(/<img\b[^>]*>/gi)].filter((m) => !/alt=["']/i.test(m[0])).length,
    hrefs: [...content.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]),
    srcs: [...content.matchAll(/src=["']([^"']+)["']/gi)].map((m) => m[1]),
    hasLandmarks: {
      header: /<header\b/i.test(content),
      main: /<main\b/i.test(content),
      nav: /<nav\b/i.test(content),
      footer: /<footer\b/i.test(content)
    },
    ldJson: [...content.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  };
}

export function check(label, ok, errors = []) {
  const pass = Boolean(ok);
  return { id: label, ok: pass, errors: pass ? [] : (Array.isArray(errors) ? errors : [errors]) };
}

export function groupPassed(checks) {
  return checks.every((c) => c.ok);
}
