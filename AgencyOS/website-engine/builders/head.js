export function buildHead(seo, { pageId = 'home', name = '', extraMeta = {} }) {
  const title = seo?.title || `${name} | Official Website`;
  const description = seo?.description || `${name} — official website.`;
  const canonical = seo?.canonical || null;
  const og = seo?.openGraph || {};
  const tw = seo?.twitter || {};
  const meta = {
    description,
    keywords: Array.isArray(seo?.keywords) ? seo.keywords.join(', ') : undefined,
    author: seo?.author || name,
    'theme-color': undefined,
    robots: seo?.robots || 'index, follow'
  };
  const property = {
    'og:title': og.title || title,
    'og:description': og.description || description,
    'og:type': og.type || 'website',
    'og:url': canonical,
    'og:image': og.image || null,
    'og:site_name': og.siteName || name,
    'og:locale': og.locale || 'en_US',
    'twitter:card': tw.card || 'summary_large_image',
    'twitter:title': tw.title || title,
    'twitter:description': tw.description || description,
    'twitter:image': tw.image || og.image || null
  };
  if (pageId === 'contact') {
    property['og:title'] = `Contact ${name}`;
    meta.description = `Contact ${name} — phone, WhatsApp, email, address and opening hours.`;
  }
  if (pageId === 'menu') {
    property['og:title'] = `${name} Menu`;
    meta.description = `View the ${name} menu and prices online.`;
  }
  for (const [k, v] of Object.entries(extraMeta)) {
    if (v) property[k] = v;
  }
  return {
    title: pageId === 'home' ? title : `${property['og:title']} | ${name}`.slice(0, 65),
    meta,
    property,
    canonical,
    robots: meta.robots,
    themeColor: null
  };
}
