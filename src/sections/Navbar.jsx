import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu as MenuIcon, X, ShoppingBag } from 'lucide-react'
import Button from '../components/Button'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../Context/ThemeContext'
import { SITE } from '../core/site'
import { asset, themedImage } from '../core/assets'
import { t } from '../core/i18n'

const { navigation, brand, i18n } = SITE
const NAV_LINKS = navigation?.items || []
const CTA = navigation?.cta || {}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme } = useTheme()

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrolled(window.scrollY > 20)
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const handleNavClick = (e, href) => {
    if (!href) return
    e.preventDefault()
    const target = document.querySelector(href)
    if (target) target.scrollIntoView({ behavior: 'smooth' })
    setMobileOpen(false)
  }

  const isAnchor = (href) => href && href.startsWith('#')
  const ctaHandler = CTA.href && isAnchor(CTA.href)
    ? (e) => handleNavClick(e, CTA.href)
    : undefined

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 transition-colors duration-200 will-change-transform ${
        scrolled
          ? 'bg-base shadow-md border-b border-ink/10'
          : 'bg-base/90'
      }`}
    >
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-5 md:px-10 py-3">
        {/* Logo Section */}
        <a href="#home" onClick={(e) => handleNavClick(e, '#home')} className="flex items-center gap-2.5 sm:gap-3 group">
          <img
            src={themedImage(brand?.logo, theme)}
            alt={brand?.logo?.alt || brand?.name || 'Logo'}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover contrast-125 transition-transform duration-200 group-hover:scale-105"
            loading="eager"
          />
          <div className="leading-tight">
            <p className="text-ink font-serif font-semibold tracking-wider text-base md:text-lg">
              {brand?.shortName || brand?.name}
            </p>
            <p className="text-[8px] sm:text-[9px] text-ink/60 tracking-[0.2em] sm:tracking-[0.25em] uppercase font-sans">
              {brand?.tagline}
            </p>
          </div>
        </a>

        {/* Desktop Links */}
        <ul className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="nav-link text-xs md:text-sm text-ink/70 hover:text-primary transition-colors duration-300 uppercase tracking-widest font-sans font-medium"
              >
                {t(link.label)}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA Button + Theme Toggle (desktop) */}
        <div className="hidden lg:flex items-center gap-4">
          <ThemeToggle />
          {CTA.label && (
            <Button
              variant="outline"
              icon={CTA.icon || ShoppingBag}
              onClick={ctaHandler}
              href={CTA.href && !isAnchor(CTA.href) ? CTA.href : undefined}
              className="!py-2 !px-5 text-xs tracking-wider uppercase"
            >
              {t(CTA.label)}
            </Button>
          )}
        </div>

        {/* Mobile: toggle + hamburger */}
        <div className="flex items-center gap-3 lg:hidden">
          <ThemeToggle />
          <button
            className="text-ink p-1 hover:text-primary transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label={t(i18n?.nav?.ariaOpen) || 'Open menu'}
          >
            <MenuIcon size={24} />
          </button>
        </div>
      </nav>

      {/* Mobile Side Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/75 z-[90] lg:hidden"
            />

            <motion.div
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              className="fixed top-0 left-0 h-screen w-[85%] max-w-xs bg-base border-r border-ink/10 z-[100] lg:hidden flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-ink/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <img
                    src={themedImage(brand?.logo, theme)}
                    alt={brand?.logo?.alt || brand?.name || 'Logo'}
                    className="w-10 h-10 rounded-full object-cover contrast-125"
                  />
                  <div className="leading-tight">
                    <p className="text-ink font-serif font-semibold tracking-wider text-sm">
                      {brand?.shortName || brand?.name}
                    </p>
                    <p className="text-[8px] text-ink/60 tracking-[0.2em] uppercase font-sans">
                      {brand?.tagline}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="text-ink/70 hover:text-primary transition-colors p-1"
                  aria-label={t(i18n?.nav?.ariaClose) || 'Close menu'}
                >
                  <X size={22} />
                </button>
              </div>

              {/* Links */}
              <ul className="flex flex-col gap-1 px-6 py-4 flex-1 overflow-y-auto">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={(e) => handleNavClick(e, link.href)}
                      className="text-ink/80 hover:text-primary uppercase text-sm tracking-widest font-sans block py-3.5 border-b border-ink/5 transition-colors duration-300"
                    >
                      {t(link.label)}
                    </a>
                  </li>
                ))}
              </ul>

              {/* Bottom CTA */}
              {CTA.label && (
                <div className="px-6 py-6 border-t border-ink/10 bg-base shrink-0">
                  <Button
                    variant="outline"
                    icon={CTA.icon || ShoppingBag}
                    onClick={ctaHandler}
                    href={CTA.href && !isAnchor(CTA.href) ? CTA.href : undefined}
                    className="w-full justify-center uppercase tracking-wider py-3 text-sm"
                  >
                    {t(CTA.label)}
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  )
}
