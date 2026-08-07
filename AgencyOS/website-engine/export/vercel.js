import { reactFiles } from './react.js';
import { stableJson } from '../utils.js';

export function vercelFiles(site) {
  const files = reactFiles(site);
  files['vercel.json'] = stableJson({
    framework: 'vite',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    cleanUrls: true
  });
  files['.vercelignore'] = 'node_modules\n';
  return files;
}
