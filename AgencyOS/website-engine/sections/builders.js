import navbar from './navbar.js';
import hero from './hero.js';
import about from './about.js';
import services from './services.js';
import products from './products.js';
import menu from './menu.js';
import gallery from './gallery.js';
import testimonials from './testimonials.js';
import faq from './faq.js';
import pricing from './pricing.js';
import offers from './offers.js';
import booking from './booking.js';
import stats from './stats.js';
import team from './team.js';
import contact from './contact.js';
import location from './location.js';
import cta from './cta.js';
import footer from './footer.js';

export const SECTION_BUILDERS = {
  navbar,
  hero,
  about,
  services,
  products,
  menu,
  gallery,
  testimonials,
  faq,
  pricing,
  offers,
  booking,
  stats,
  team,
  contact,
  location,
  cta,
  footer
};

export const SECTION_IDS = Object.keys(SECTION_BUILDERS).sort();
