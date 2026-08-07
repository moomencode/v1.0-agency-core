export const SECTION_CATALOG = {
  navbar: { label: 'Navbar', anchor: '#home' },
  hero: { label: 'Hero', anchor: '#home' },
  menu: { label: 'Menu', anchor: '#menu' },
  services: { label: 'Services', anchor: '#services' },
  stats: { label: 'Stats', anchor: '#stats' },
  offers: { label: 'Offers', anchor: '#offers' },
  reservation: { label: 'Reservation', anchor: '#reservation' },
  testimonials: { label: 'Testimonials', anchor: '#testimonials' },
  gallery: { label: 'Gallery', anchor: '#gallery' },
  features: { label: 'Features', anchor: '#features' },
  faq: { label: 'FAQ', anchor: '#faq' },
  contact: { label: 'Contact', anchor: '#contact' },
  location: { label: 'Location', anchor: '#location' },
  footer: { label: 'Footer', anchor: '#footer' }
};

export function planSections(n) {
  const base = n.profile.sections || [];
  const plan = [];
  for (const sid of base) {
    const def = SECTION_CATALOG[sid];
    if (!def) continue;
    let enabled = true;
    const reasons = [];
    if (sid === 'menu') {
      enabled = n.hasMenus;
      if (!enabled) reasons.push('no menu data');
    }
    if (sid === 'gallery') {
      enabled = n.hasGallery;
      if (!enabled) reasons.push('no photos');
    }
    if (sid === 'testimonials') {
      enabled = n.hasReviews;
      if (!enabled) reasons.push('no reviews');
    }
    if (sid === 'reservation') {
      enabled = n.hasBooking;
      if (!enabled) reasons.push('no booking signal');
    }
    if (sid === 'faq') {
      enabled = Boolean(n.profile.faq.length);
      if (!enabled) reasons.push('no faq profile');
    }
    plan.push({ id: sid, label: def.label, anchor: def.anchor, enabled, disabledReason: enabled ? null : reasons.join('; ') });
  }
  const ids = plan.filter((s) => s.enabled).map((s) => s.id);
  return { plan, enabledIds: ids };
}
