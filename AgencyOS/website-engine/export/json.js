import { stableJson } from '../utils.js';
import { serializeBodyJsx } from '../renderer/serialize-jsx.js';

export function jsonFiles(site, validation = null) {
  const bundle = {
    engineVersion: site.engineVersion,
    businessId: site.businessId,
    name: site.name,
    category: site.category,
    layout: site.layout,
    theme: site.theme,
    assets: site.assets,
    structuredData: site.structuredData,
    pages: site.pages.map((p) => ({
      id: p.id,
      path: p.path,
      route: p.route,
      title: p.head.title,
      sections: p.sections
    })),
    validation: validation || null
  };
  return { 'site-bundle.json': stableJson(bundle) };
}
