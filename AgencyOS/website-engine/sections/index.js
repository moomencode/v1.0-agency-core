export const SECTION_MAP = {
  navbar: 'navbar',
  hero: 'hero',
  menu: 'menu',
  services: 'services',
  features: 'about',
  stats: 'stats',
  offers: 'offers',
  reservation: 'booking',
  testimonials: 'testimonials',
  gallery: 'gallery',
  faq: 'faq',
  contact: 'contact',
  location: 'location',
  footer: 'footer'
};

export const SECTION_DEFS = {
  navbar: { id: 'navbar', label: 'Navbar', required: false, configFiles: ['navigation.json', 'brand.json'] },
  hero: { id: 'home', label: 'Hero', required: true, configFiles: ['hero.json', 'brand.json'] },
  about: { id: 'features', label: 'About', required: false, configFiles: ['features.json', 'brand.json'] },
  services: { id: 'services', label: 'Services', required: false, configFiles: ['services.json'] },
  products: { id: 'products', label: 'Products', required: false, configFiles: ['products.json', 'menu.json'] },
  menu: { id: 'menu', label: 'Menu', required: false, configFiles: ['menu.json'] },
  gallery: { id: 'gallery', label: 'Gallery', required: false, configFiles: ['gallery.json'] },
  testimonials: { id: 'testimonials', label: 'Testimonials', required: false, configFiles: ['reviews.json'] },
  faq: { id: 'faq', label: 'FAQ', required: false, configFiles: ['faq.json'] },
  pricing: { id: 'pricing', label: 'Pricing', required: false, configFiles: ['pricing.json'] },
  offers: { id: 'offers', label: 'Offers', required: false, configFiles: ['offers.json'] },
  booking: { id: 'reservation', label: 'Booking', required: false, configFiles: ['booking.json', 'contact.json'] },
  stats: { id: 'stats', label: 'Stats', required: false, configFiles: ['stats.json'] },
  team: { id: 'team', label: 'Team', required: false, configFiles: ['team.json'] },
  contact: { id: 'contact', label: 'Contact', required: true, configFiles: ['contact.json', 'social.json'] },
  location: { id: 'location', label: 'Location', required: false, configFiles: ['contact.json'] },
  cta: { id: 'cta', label: 'CTA', required: false, configFiles: ['navigation.json', 'brand.json'] },
  footer: { id: 'footer', label: 'Footer', required: true, configFiles: ['footer.json', 'brand.json', 'navigation.json', 'social.json'] }
};

export { SECTION_BUILDERS, SECTION_IDS } from './builders.js';

export function mapSectionId(pipelineId) {
  return SECTION_MAP[pipelineId] || null;
}
