// scripts/schemas.mjs
// ---------------------------------------------------------------------------
// Validation schemas for the configuration layer. Used by scripts/qa.mjs
// to automatically verify that a business's config files are complete and
// consistent — the "Automatic QA" step of the pipeline.
// ---------------------------------------------------------------------------

export const REQUIRED_FILES = [
  'business.json',
  'brand.json',
  'theme.json',
  'seo.json',
  'social.json',
  'contact.json',
  'navigation.json',
  'hero.json',
  'menu.json',
  'offers.json',
  'gallery.json',
  'booking.json',
  'features.json',
  'services.json',
  'stats.json',
  'reviews.json',
  'faq.json',
  'footer.json',
  'i18n.json',
]

export const SUPPORTED_BUSINESS_TYPES = [
  'restaurant',
  'cafe',
  'bakery',
  'pizza',
  'burger',
  'dessert',
  'hotel',
  'clinic',
  'gym',
  'barber',
  'beauty-salon',
  'beauty',
  'business',
]

export const REQUIRED_BY_FILE = {
  'business.json': ['name', 'type', 'locale', 'sections'],
  'brand.json': ['name', 'shortName', 'tagline'],
  'theme.json': ['defaultMode', 'colors'],
  'seo.json': ['title', 'description', 'canonical'],
  'social.json': ['facebook', 'instagram', 'whatsapp'],
  'contact.json': ['phone', 'address', 'mapsUrl', 'mapsEmbed'],
  'navigation.json': ['items'],
  'hero.json': ['title', 'subtitle', 'ctaPrimary', 'ctaSecondary', 'info'],
  'menu.json': ['categories', 'dishes'],
  'offers.json': ['heading', 'items'],
  'gallery.json': ['images'],
  'booking.json': ['heading', 'submit'],
  'footer.json': ['brandDescription'],
}

export const MODULE_SECTIONS = [
  'navbar',
  'hero',
  'menu',
  'offers',
  'reservation',
  'gallery',
  'location',
  'footer',
  'about',
  'services',
  'stats',
  'testimonials',
  'faq',
  'orderOnline',
]
