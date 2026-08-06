export const MENU_CATEGORIES = ['restaurant', 'cafe', 'bakery', 'pizza', 'burger', 'dessert'];
export const BOOKING_CATEGORIES = ['restaurant', 'cafe', 'pizza', 'burger', 'hotel', 'clinic', 'gym', 'barber', 'beauty-salon'];

export const SLOW_MS = 2500;
export const OUTDATED_COPYRIGHT_BEFORE = 2022;

export const WEAKNESS_DEFS = {
  'no-website': { label: 'No website', severity: 'major', category: 'web', description: 'No website found on any source' },
  'broken-website': { label: 'Broken website', severity: 'major', category: 'web', description: 'Website fails to load (HTTP error or connection failure)' },
  'slow-website': { label: 'Slow website', severity: 'minor', category: 'web', description: 'Website responds slower than the SLA threshold' },
  'missing-seo': { label: 'Missing SEO', severity: 'major', category: 'seo', description: 'Core SEO elements (title, description, H1, viewport, lang) missing' },
  'no-whatsapp': { label: 'No WhatsApp', severity: 'major', category: 'contact', description: 'No WhatsApp number on record' },
  'no-online-menu': { label: 'No online menu', severity: 'major', category: 'commerce', description: 'Food business without an online menu' },
  'poor-branding': { label: 'Poor branding', severity: 'minor', category: 'brand', description: 'Few photos and/or no social profiles' },
  'no-booking': { label: 'No booking', severity: 'minor', category: 'commerce', description: 'Hospitality business without a booking channel' },
  'outdated-design': { label: 'Outdated design', severity: 'minor', category: 'web', description: 'Design-era signals: no viewport, no HTTPS, old copyright, legacy generator' }
};

function probeOf(record) {
  return record.probe && typeof record.probe === 'object' ? record.probe : null;
}

export const WEAKNESS_RULES = {
  'no-website': {
    test(record) {
      if (record.website) return { status: 'ok' };
      return { status: 'detected', evidence: 'no website found on any source' };
    }
  },
  'broken-website': {
    test(record) {
      const probe = probeOf(record);
      if (!record.website || !probe) return { status: 'skip' };
      if (!probe.ok) {
        const evidence = probe.error || `HTTP ${probe.status}`;
        return { status: 'detected', evidence: `website failed to load: ${evidence}` };
      }
      return { status: 'ok' };
    }
  },
  'slow-website': {
    test(record) {
      const probe = probeOf(record);
      if (!record.website || !probe || !probe.ok) return { status: 'skip' };
      if (probe.timeMs > SLOW_MS) return { status: 'detected', evidence: `website responded in ${probe.timeMs}ms (threshold ${SLOW_MS}ms)` };
      return { status: 'ok' };
    }
  },
  'missing-seo': {
    test(record) {
      const probe = probeOf(record);
      if (!record.website || !probe || !probe.ok) return { status: 'skip' };
      const missing = [];
      if (!probe.title) missing.push('title');
      if (!probe.metaDescription) missing.push('meta description');
      if (!probe.hasH1) missing.push('H1');
      if (!probe.hasViewport) missing.push('viewport');
      if (!probe.hasLang) missing.push('lang');
      if (!missing.length) return { status: 'ok' };
      return { status: 'detected', evidence: `missing SEO elements: ${missing.join(', ')}` };
    }
  },
  'no-whatsapp': {
    test(record) {
      if (record.whatsapp) return { status: 'ok' };
      const evidence = record.phone ? `phone present (${record.phone}), WhatsApp not linked` : 'no phone or WhatsApp on record';
      return { status: 'detected', evidence };
    }
  },
  'no-online-menu': {
    test(record) {
      if (!MENU_CATEGORIES.includes(record.category)) return { status: 'skip' };
      if (record.menus && record.menus.length) return { status: 'ok' };
      const probe = probeOf(record);
      if (probe && probe.ok && probe.menuHints && probe.menuHints.length) return { status: 'ok' };
      return { status: 'detected', evidence: 'no menu link or menu file found' };
    }
  },
  'poor-branding': {
    test(record) {
      const photoCount = (record.photos || []).length;
      const hasSocial = !!(record.instagram || record.facebook);
      if (photoCount < 3 || !hasSocial) {
        const parts = [];
        if (photoCount < 3) parts.push(`${photoCount} photo(s)`);
        if (!hasSocial) parts.push('no social profiles');
        return { status: 'detected', evidence: `weak brand assets: ${parts.join(', ')}` };
      }
      return { status: 'ok' };
    }
  },
  'no-booking': {
    test(record) {
      if (!BOOKING_CATEGORIES.includes(record.category)) return { status: 'skip' };
      if (record.booking) return { status: 'ok' };
      const probe = probeOf(record);
      if (probe && probe.ok && probe.bookingHints && probe.bookingHints.length) return { status: 'ok' };
      return { status: 'detected', evidence: 'no booking channel (reservation link / widget / directory listing) found' };
    }
  },
  'outdated-design': {
    test(record) {
      const probe = probeOf(record);
      if (!record.website || !probe || !probe.ok) return { status: 'skip' };
      const signals = [];
      if (probe.hasViewport === false) signals.push('no mobile viewport');
      if (probe.isHttps === false) signals.push('served over HTTP');
      if (probe.copyrightYear && probe.copyrightYear < OUTDATED_COPYRIGHT_BEFORE) signals.push(`copyright ${probe.copyrightYear}`);
      if (probe.generatorHint && /frontpage|dreamweaver|classic.?asp|site.?24x7/i.test(probe.generatorHint)) signals.push(`legacy generator "${probe.generatorHint}"`);
      if (!signals.length) return { status: 'ok' };
      return { status: 'detected', evidence: `design-era signals: ${signals.join(', ')}` };
    }
  }
};

export function detectWeaknesses(record) {
  const found = [];
  for (const [id, rule] of Object.entries(WEAKNESS_RULES)) {
    const result = rule.test(record);
    if (result.status === 'detected') {
      found.push({
        id,
        label: WEAKNESS_DEFS[id].label,
        severity: WEAKNESS_DEFS[id].severity,
        category: WEAKNESS_DEFS[id].category,
        evidence: result.evidence
      });
    }
  }
  return found;
}

export function weaknessesCatalog() {
  return WEAKNESS_DEFS;
}
