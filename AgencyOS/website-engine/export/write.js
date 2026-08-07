import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from '../utils.js';

export async function writeFiles(root, files) {
  const checksums = {};
  const entries = Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [rel, content] of entries) {
    const target = path.join(root, rel);
    await mkdir(path.dirname(target), { recursive: true });
    const bytes = typeof content === 'string' ? content : Buffer.from(content);
    await writeFile(target, bytes);
    checksums[rel.replace(/\\/g, '/')] = sha256(bytes);
  }
  return checksums;
}

export function fileTree(files) {
  return Object.keys(files).sort().join('\n');
}
