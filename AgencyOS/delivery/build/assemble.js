import { posixPath } from '../utils.js';

export function assembleProductionTree(site, files) {
  const tree = {};
  for (const [rel, content] of Object.entries(files || {})) {
    const key = posixPath(rel);
    tree[key] = typeof content === 'string' ? content : String(content);
  }
  const meta = {
    engineVersion: site.engineVersion || 'unknown',
    businessId: site.businessId,
    pages: (site.pages || []).map((p) => p.path),
    generatedBy: 'delivery-build'
  };
  tree['delivery-meta.json'] = `${JSON.stringify(meta, null, 2)}\n`;
  return tree;
}
