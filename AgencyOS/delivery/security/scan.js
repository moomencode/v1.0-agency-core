const SECRET_PATTERNS = [
  {
    name: 'key-value-secret',
    re: /(?:(?:api[_-]?key|secret|token|password|passwd|access[_-]?key|authorization|auth)\s*[=:]\s*["']?[A-Za-z0-9_\-./+]{8,})/gi
  },
  {
    name: 'bearer-token',
    re: /\bBearer\s+[A-Za-z0-9_\-.]{16,}/gi
  },
  {
    name: 'known-prefix',
    re: /\b(?:sk|ghp|gho|xox[baprs]|vk|glpat)[-_][A-Za-z0-9]{10,}\b/g
  },
  {
    name: 'aws-access-key',
    re: /\bAKIA[A-Z0-9]{16}\b/g
  }
];

export function entropy(str) {
  const counts = new Map();
  for (const ch of String(str)) counts.set(ch, (counts.get(ch) || 0) + 1);
  const len = String(str).length;
  if (len === 0) return 0;
  let e = 0;
  for (const c of counts.values()) {
    const p = c / len;
    e -= p * Math.log2(p);
  }
  return e;
}

export function isHighEntropy(value) {
  const s = String(value);
  return s.length >= 12 && entropy(s) >= 3.4;
}

export function scanText(text) {
  const source = String(text);
  const matches = [];
  for (const { name, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) {
      matches.push({ type: name, snippet: m[0], start: m.index });
      if (matches.length > 500) break;
    }
  }
  return matches;
}

export function scanFiles(files) {
  const results = [];
  for (const [relPath, content] of Object.entries(files || {})) {
    if (typeof content !== 'string') continue;
    const matches = scanText(content);
    if (matches.length) results.push({ path: relPath, matches });
  }
  return results;
}

export function hasSecretScanFailure(scanResults) {
  return scanResults.length > 0;
}
