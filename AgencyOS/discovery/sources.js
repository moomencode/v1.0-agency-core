import { disError, DIS_CODES } from './errors.js';
import { normalizeUrl, normalizeSocial } from './enrich.js';

const HREF = /href=["']([^"']*)["']/gi;
const MAILTO = /mailto:([^"'\s?]+)/i;
const TEL = /tel:([^"'\s?]+)/i;
const MENU_HINTS = ['menu', 'menus'];
const BOOKING_HINTS = ['reservation', 'booking', 'bookatable', 'opentable', 'reserve'];

export class SourceAdapter {
  constructor({ id, name }) {
    this.id = id;
    this.name = name;
  }

  get ready() {
    return false;
  }

  async discover(_query, _opts) {
    throw disError(DIS_CODES.SOURCE_UNAVAILABLE, `source "${this.id}" is not configured`);
  }

  normalize(candidate) {
    return candidate;
  }

  validate(candidate) {
    return { valid: true, errors: [] };
  }

  async enrich(candidate) {
    return candidate;
  }

  score(_candidate) {
    return null;
  }
}

export function finalizeProbe(probe) {
  if (probe && typeof probe.html === 'string' && probe.title === undefined) {
    analyzeHtml(probe, probe.html);
  }
  return probe;
}

export class SimulatedSource extends SourceAdapter {
  constructor({ fixtures = null } = {}) {
    super({ id: 'simulated', name: 'Simulated Market Data' });
    this.fixtures = fixtures;
  }

  get ready() {
    return true;
  }

  async discover(query, opts = {}) {
    let rows = this.fixtures && this.fixtures.length ? this.fixtures : null;
    if (!rows) {
      const { CATALOG } = await import('./catalog.js');
      rows = CATALOG;
    }
    let out = rows.slice();
    if (!query.all) {
      if (query.category) out = out.filter((b) => b.category === query.category);
      if (query.area) out = out.filter((b) => String(b.area).toLowerCase().includes(String(query.area).toLowerCase()));
      if (query.term) {
        const t = String(query.term).toLowerCase();
        out = out.filter((b) => b.name.toLowerCase().includes(t) || b.category.toLowerCase().includes(t));
      }
    }
    const limit = opts.limit || query.limit || 50;
    return out.slice(0, limit).map((b) => ({ ...b, sources: ['simulated'].concat(b.sources || []) }));
  }

  score(candidate) {
    return {
      source: this.id,
      demandHint: candidate.reviews != null ? Math.round(Math.log10(candidate.reviews + 1) * 20) : null,
      fixture: !!this.fixtures
    };
  }
}

export class WebsiteSource extends SourceAdapter {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 8000, probeMode = 'online' } = {}) {
    super({ id: 'website', name: 'Official Websites' });
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.probeMode = probeMode;
  }

  get ready() {
    return typeof this.fetchImpl === 'function';
  }

  async discover(query, opts = {}) {
    const domains = opts.domains || query.domains;
    if (!Array.isArray(domains) || !domains.length) return [];
    if (!this.ready) throw disError(DIS_CODES.SOURCE_UNAVAILABLE, 'website source has no fetch client configured');
    const out = [];
    for (const domain of domains.slice(0, opts.limit || 25)) {
      const probe = await this.probe(domain);
      const name = probe.title || domain.replace(/^https?:\/\//i, '').split('.')[0];
      out.push({
        name,
        category: 'other',
        area: query.area || 'Unknown',
        country: query.country || null,
        website: normalizeUrl(domain),
        instagram: probe.instagram || null,
        facebook: probe.facebook || null,
        email: probe.email || null,
        phone: probe.phone || null,
        menus: probe.menuHints.length ? probe.menuHints : [],
        booking: probe.bookingHints.length ? probe.bookingHints[0] : null,
        probe,
        sources: ['website']
      });
    }
    return out;
  }

  normalize(candidate) {
    if (candidate.area == null) candidate.area = 'Unknown';
    return candidate;
  }

  validate(candidate) {
    if (!candidate.name || !String(candidate.name).trim()) {
      return { valid: false, errors: [{ path: 'name', message: 'website candidate requires a name (title or domain)' }] };
    }
    return { valid: true, errors: [] };
  }

  async enrich(candidate) {
    if (!candidate.probe && candidate.website && this.probeMode !== 'offline') {
      candidate.probe = await this.probe(candidate.website);
    }
    return candidate;
  }

  score(candidate) {
    const probe = candidate.probe || null;
    return {
      source: this.id,
      probed: !!probe,
      ok: probe ? probe.ok : null,
      status: probe ? probe.status : null,
      timeMs: probe ? probe.timeMs : null
    };
  }

  async probe(url) {
    const target = normalizeUrl(url);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    if (timer && timer.unref) timer.unref();
    const started = Date.now();
    const result = { ok: false, status: 0, timeMs: 0, isHttps: target.startsWith('https://'), error: null, html: '' };
    try {
      const resp = await this.fetchImpl(target, { signal: controller ? controller.signal : undefined, redirect: 'follow' });
      const text = await resp.text();
      const measured = Date.now() - started;
      const hdr = resp.headers && typeof resp.headers.get === 'function' ? resp.headers.get('x-probe-ms') : null;
      result.timeMs = hdr ? Number(hdr) || measured : measured;
      result.status = resp.status;
      result.ok = resp.status >= 200 && resp.status < 400;
      result.html = text;
      analyzeHtml(result, text);
      return result;
    } catch (e) {
      result.error = String((e && e.message) || e);
      result.timeMs = Date.now() - started;
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function analyzeHtml(result, text) {
  const title = text.match(/<title[^>]*>([^<]*)<\/title>/i);
  result.title = title ? title[1].trim() : null;
  result.metaDescription = !!text.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  result.hasH1 = /<h1[^>]*>/i.test(text);
  result.hasViewport = /<meta[^>]+name=["']viewport["']/i.test(text);
  result.hasLang = /<html[^>]+lang=["'][^"']+["']/i.test(text);
  const copy = text.match(/(?:©|&copy;|copyright)[^<\n]{0,60}?(\d{4})/i);
  result.copyrightYear = copy ? Number(copy[1]) : null;
  const gen = text.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i);
  result.generatorHint = gen ? gen[1].trim() : null;

  const hrefs = Array.from(text.matchAll(HREF), (m) => m[1]).filter(Boolean);
  const lower = hrefs.map((h) => h.toLowerCase());
  result.menuHints = hrefs.filter((_, i) => MENU_HINTS.some((k) => lower[i].includes(k)));
  result.bookingHints = hrefs.filter((_, i) => BOOKING_HINTS.some((k) => lower[i].includes(k)));
  const ig = lower.find((h) => h.includes('instagram.com'));
  const fb = lower.find((h) => h.includes('facebook.com'));
  result.instagram = ig ? normalizeSocial(ig) : null;
  result.facebook = fb ? normalizeSocial(fb) : null;
  const mail = text.match(MAILTO);
  result.email = mail ? mail[1].trim() : null;
  const tel = text.match(TEL);
  result.phone = tel ? tel[1].trim() : null;
}

export class GoogleMapsSource extends SourceAdapter {
  constructor({ client = null, apiKey = null } = {}) {
    super({ id: 'google-maps', name: 'Google Maps' });
    this.client = client || apiKey;
  }

  get ready() {
    return typeof this.client === 'function';
  }

  async discover(query, opts = {}) {
    if (!this.ready) throw disError(DIS_CODES.SOURCE_UNAVAILABLE, 'google-maps source needs a client function (api key / scraper)');
    return this.client(query, opts);
  }
}

export class FacebookSource extends SourceAdapter {
  constructor({ client = null } = {}) {
    super({ id: 'facebook', name: 'Facebook' });
    this.client = client;
  }

  get ready() {
    return typeof this.client === 'function';
  }

  async discover(query, opts = {}) {
    if (!this.ready) throw disError(DIS_CODES.SOURCE_UNAVAILABLE, 'facebook source needs a client function');
    return this.client(query, opts);
  }
}

export class InstagramSource extends SourceAdapter {
  constructor({ client = null } = {}) {
    super({ id: 'instagram', name: 'Instagram' });
    this.client = client;
  }

  get ready() {
    return typeof this.client === 'function';
  }

  async discover(query, opts = {}) {
    if (!this.ready) throw disError(DIS_CODES.SOURCE_UNAVAILABLE, 'instagram source needs a client function');
    return this.client(query, opts);
  }
}

export class DirectorySource extends SourceAdapter {
  constructor({ client = null } = {}) {
    super({ id: 'directory', name: 'Directories' });
    this.client = client;
  }

  get ready() {
    return typeof this.client === 'function';
  }

  async discover(query, opts = {}) {
    if (!this.ready) throw disError(DIS_CODES.SOURCE_UNAVAILABLE, 'directory source needs a client function');
    return this.client(query, opts);
  }
}

export const DEFAULT_SOURCES = {
  simulated: (opts) => new SimulatedSource(opts),
  website: (opts) => new WebsiteSource(opts),
  'google-maps': (opts) => new GoogleMapsSource(opts),
  facebook: (opts) => new FacebookSource(opts),
  instagram: (opts) => new InstagramSource(opts),
  directory: (opts) => new DirectorySource(opts)
};
