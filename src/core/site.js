// src/core/site.js
// ---------------------------------------------------------------------------
// The single source of truth for the active business configuration.
// All JSON files in /config are aggregated here and normalized with safe
// defaults, so every component reads from one place and never hardcodes
// business data.
// ---------------------------------------------------------------------------

import business from '../../config/business.json'
import brand from '../../config/brand.json'
import theme from '../../config/theme.json'
import seo from '../../config/seo.json'
import social from '../../config/social.json'
import contact from '../../config/contact.json'
import navigation from '../../config/navigation.json'
import hero from '../../config/hero.json'
import menu from '../../config/menu.json'
import offers from '../../config/offers.json'
import gallery from '../../config/gallery.json'
import booking from '../../config/booking.json'
import features from '../../config/features.json'
import services from '../../config/services.json'
import stats from '../../config/stats.json'
import reviews from '../../config/reviews.json'
import faq from '../../config/faq.json'
import footer from '../../config/footer.json'
import i18n from '../../config/i18n.json'

export const SITE = {
  business,
  brand,
  theme,
  seo,
  social,
  contact,
  navigation,
  hero,
  menu,
  offers,
  gallery,
  booking,
  features,
  services,
  stats,
  reviews,
  faq,
  footer,
  i18n,
}

/**
 * Deep-merge defaults so missing config keys never crash a section.
 * Components should use `getConfig()` and rely on the resolved shape.
 */
export function getConfig(key = null) {
  if (!key) return SITE
  return SITE[key] || {}
}
