import { gzipSync } from 'node:zlib';

export const DEFAULT_BUDGET = {
  maxTotalBytes: 5 * 1024 * 1024,
  maxGzipBytes: 1.5 * 1024 * 1024
};

export function checkBudget(files, limits = DEFAULT_BUDGET) {
  const entries = Object.entries(files || {});
  let totalBytes = 0;
  for (const [, content] of entries) {
    totalBytes += Buffer.byteLength(String(content), 'utf8');
  }
  let gzipBytes = 0;
  for (const [, content] of entries) {
    gzipBytes += gzipSync(Buffer.from(String(content), 'utf8')).length;
  }
  return {
    totalBytes,
    gzipEstimate: gzipBytes,
    limits,
    passed: totalBytes <= limits.maxTotalBytes && gzipBytes <= limits.maxGzipBytes
  };
}
