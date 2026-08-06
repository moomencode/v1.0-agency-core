import React from 'react'
import { ThemeProvider } from './Context/ThemeContext'
import { enabledSections } from './core/config'
import Navbar from './sections/Navbar'
import Hero from './sections/Hero'
import Menu from './sections/Menu'
import Offers from './sections/Offers'
import Reservation from './sections/Reservation'
import Gallery from './sections/Gallery'
import Footer from './sections/Footer'
import LocationSection from './sections/LocationSection'
import About from './sections/About'
import Services from './sections/Services'
import Stats from './sections/Stats'
import Testimonials from './sections/Testimonials'
import Faq from './sections/Faq'
import OrderOnline from './sections/OrderOnline'

/**
 * SECTION_REGISTRY
 * Maps config section ids (config/business.json -> sections array) to
 * React components. Add a new module to the registry + to the config
 * list and it renders — no other wiring needed.
 */
const SECTION_REGISTRY = {
  navbar: Navbar,
  hero: Hero,
  menu: Menu,
  offers: Offers,
  reservation: Reservation,
  gallery: Gallery,
  location: LocationSection,
  footer: Footer,
  about: About,
  services: Services,
  stats: Stats,
  testimonials: Testimonials,
  faq: Faq,
  orderOnline: OrderOnline,
}

/**
 * App.jsx
 * Root component — renders every section declared in config/business.json
 * (in order) inside the ThemeProvider. Adding/removing/reordering a
 * business's page never touches source code.
 */
export default function App() {
  const ids = enabledSections()
  const sections = ids.map((id) => SECTION_REGISTRY[id]).filter(Boolean)

  return (
    <ThemeProvider>
      <div className="min-h-screen">
        {sections.map((Section, index) => (
          <Section key={`${ids[index] || index}`} />
        ))}
      </div>
    </ThemeProvider>
  )
}
