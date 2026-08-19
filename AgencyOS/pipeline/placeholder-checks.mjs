// AgencyOS/pipeline/placeholder-checks.mjs
// ---------------------------------------------------------------------------
// Phase 2 P2: obvious placeholder / fake commercial value detection.
//
// The business-input gate validates in layers:
//   1. missing            -> "missing required field" (unchanged)
//   2. syntactically bad  -> format/regex checks (unchanged)
//   3. obvious fake       -> THIS MODULE (reserved demo domains, template
//                            path tokens, synthetic phone patterns)
//   4. valid              -> accepted
//
// Pure functions only (no I/O, no pipeline imports) so the generator and the
// P2 test suite exercise exactly the same rules. Nothing here rejects a
// legitimate real-world value: reserved demonstration domains (RFC 2606 /
// RFC 6761) and template-shaped paths are rejected; a real domain that merely
// contains the words "test" or "example" is NOT rejected.
// ---------------------------------------------------------------------------

// RFC 2606 amendment 1 / RFC 6761 reserved demonstration second-level domains.
const RESERVED_HOSTS = new Set(['example.com', 'example.org', 'example.net', 'example.edu'])

// RFC 6761 reserved TLDs (also covers bare "localhost").
const RESERVED_TLDS = new Set(['example', 'invalid', 'test', 'localhost'])

// Path segments that scream "template left unfilled" (start-of-segment
// tokens: /yourbusiness, /your-business, /placeholder, /placeholder-account).
const PLACEHOLDER_PATH_TOKEN = /(?:^|\/)(?:yourbusiness|your-business|placeholder)/i

/** Lowercased hostname of a URL, or null when the string is not a URL. */
export function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * True when the URL is an obvious placeholder:
 *   - reserved demo domain (example.com / example.org / example.net /
 *     example.edu, including subdomains like foo.example.com)
 *   - reserved demo TLD (.example, .invalid, .test, .localhost)
 *   - a path containing template tokens (yourbusiness, your-business,
 *     placeholder)
 * False for any real-shaped URL. Non-URL strings return false (layer 2
 * already rejected them).
 */
export function isReservedUrl(url) {
  const host = hostOf(url)
  if (!host) return false
  const labels = host.split('.')
  if (RESERVED_HOSTS.has(host)) return true
  if (labels.length >= 2 && RESERVED_HOSTS.has(labels.slice(-2).join('.'))) return true
  if (RESERVED_TLDS.has(labels[labels.length - 1])) return true
  let pathname = ''
  try {
    pathname = new URL(String(url)).pathname
  } catch {
    return false
  }
  return PLACEHOLDER_PATH_TOKEN.test(pathname)
}

/**
 * True when the phone is an obvious fake:
 *   - all zeros (000000)
 *   - a trailing run of 6+ zeros (the "+1 000 000 0000" family)
 *   - a single repeated digit across the whole number ("1111111111")
 *   - an 8+ same-digit run anywhere ("0111111111")
 *   - the classic sequential fakery 1234567890 / 9876543210
 * Real-shaped numbers — including Egyptian +20 numbers like
 * "+20 100 000 0031" (six zeros mid-run with real trailing digits) — pass.
 */
export function isFakePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return false // missing/empty is handled by layers 1-2
  if (/^0+$/.test(digits)) return true
  if (/0{6,}$/.test(digits)) return true
  if (/^(\d)\1{5,}$/.test(digits)) return true
  if (/(\d)\1{7,}/.test(digits)) return true
  if (/^(1234567890|9876543210)$/.test(digits)) return true
  return false
}

const FIELD_RULES = [
  { field: 'canonical', kind: 'URL', test: isReservedUrl, reason: 'URL is a reserved demo/placeholder domain or contains a template path token' },
  { field: 'facebook', kind: 'URL', test: isReservedUrl, reason: 'URL is a reserved demo/placeholder domain or contains a template path token' },
  { field: 'instagram', kind: 'URL', test: isReservedUrl, reason: 'URL is a reserved demo/placeholder domain or contains a template path token' },
  { field: 'phone', kind: 'phone', test: isFakePhone, reason: 'phone is a synthetic/all-zero/fake pattern — supply the real business phone' },
  { field: 'whatsapp', kind: 'phone', test: isFakePhone, reason: 'phone is a synthetic/all-zero/fake pattern — supply the real WhatsApp number' }
]

/**
 * Returns [{ field, value, reason }] for every provided required commercial
 * field that is an obvious placeholder. Pure — the caller decides how to
 * react (fail fast, or accept for explicitly demo-marked inputs).
 */
export function placeholderErrors(values) {
  const out = []
  for (const rule of FIELD_RULES) {
    const value = values?.[rule.field]
    if (value === undefined || value === null || value === '') continue // layer 1 handles missing
    if (rule.test(value)) out.push({ field: rule.field, value: String(value), reason: rule.reason })
  }
  return out
}