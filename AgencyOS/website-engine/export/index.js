import { staticFiles } from './html.js';
import { reactFiles } from './react.js';
import { jsonFiles } from './json.js';
import { vercelFiles } from './vercel.js';
import { writeFiles } from './write.js';
import { join } from 'node:path';
import { webError, WEB_CODES } from '../errors.js';
import { stableJson } from '../utils.js';

export const EXPORT_FORMATS = ['static', 'react', 'json', 'vercel'];

export function exportFiles(site, { format = 'static', validation = null } = {}) {
  let files;
  switch (format) {
    case 'static': files = staticFiles(site); break;
    case 'react': files = reactFiles(site); break;
    case 'json': files = jsonFiles(site, validation); break;
    case 'vercel': files = vercelFiles(site); break;
    case 'all':
      files = {
        ...staticFiles(site),
        ...reactFiles(site),
        ...jsonFiles(site, validation),
        ...vercelFiles(site)
      };
      break;
    default:
      throw webError(WEB_CODES.UNKNOWN_FORMAT, `unknown export format "${format}"`);
  }
  return files;
}

export async function writeExport(site, { format = 'all', root, validation = null } = {}) {
  if (!root) throw webError(WEB_CODES.EXPORT_FAILED, 'root required for export');
  const subDirs = { static: 'static', react: 'react', json: 'json', vercel: 'vercel' };
  const checksums = {};
  let files = 0;
  if (format === 'all') {
    for (const sub of Object.keys(subDirs)) {
      const group = exportFiles(site, { format: sub, validation });
      const sums = await writeFiles(join(root, subDirs[sub]), group);
      for (const [f, h] of Object.entries(sums)) checksums[`${subDirs[sub]}/${f}`] = h;
      files += Object.keys(group).length;
    }
  } else {
    const group = exportFiles(site, { format, validation });
    Object.assign(checksums, await writeFiles(root, group));
    files = Object.keys(group).length;
  }
  const manifest = {
    engineVersion: site.engineVersion,
    businessId: site.businessId,
    name: site.name,
    category: site.category,
    layout: site.layout.id,
    format,
    files,
    checksums
  };
  const manifestPath = 'site-manifest.json';
  await writeFiles(root, { [manifestPath]: stableJson(manifest) });
  return { manifest, checksums };
}

export { writeFiles } from './write.js';
export { staticFiles } from './html.js';
export { reactFiles } from './react.js';
export { jsonFiles } from './json.js';
export { vercelFiles } from './vercel.js';
