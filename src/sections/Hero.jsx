import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Button from '../components/Button'
import { useTheme } from '../Context/ThemeContext'
import { SITE } from '../core/site'
import { themedImage } from '../core/assets'
import { icon } from '../core/icons'
import { t } from '../core/i18n'

const { hero, brand } = SITE

export default function Hero() {
  const { theme } = useTheme()
  const ctaPrimary = hero?.ctaPrimary || {}
  const ctaSecondary = hero?.ctaSecondary || {}
  const infoItems = hero?.info || []

  const scrollTo = (href) => (e) => {
    if (!href) return
    if (e) e.preventDefault()
    const target = document.querySelector(href)
    if (target) target.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      id="home"
      className="relative pt-36 md:pt-48 pb-24 md:pb-32 px-5 md:px-10 overflow-hidden bg-base"
    >
      {/* 1. Hero background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className="absolute inset-0 md:left-auto md:right-0 w-full md:w-[60%] h-full pointer-events-none z-0"
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={theme}
            src={themedImage(hero?.image, theme)}
            alt={hero?.image?.alt || brand?.name || 'Hero'}
            loading="eager"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}

            className={`absolute inset-0 w-full h-full object-cover object-center ${
              theme === 'dark'
                ? 'opacity-60 md:opacity-95'
                : 'opacity-70 md:opacity-100'
            }`}
          />
        </AnimatePresence>

        <div className="absolute inset-0 bg-base/50 md:bg-gradient-to-r md:from-base md:via-base/20 md:to-transparent" />

        <div className="absolute inset-0 bg-gradient-to-t from-base via-transparent to-base/20 md:to-transparent" />
      </motion.div>

      {/* Warm glow */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] pointer-events-none z-0"></div>

      {/* 2. Main content */}
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center relative z-10">
        <motion.div
          initial={{ opacity: 0, x: -35 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-center md:text-left md:pr-6"
        >
          <p className="font-display italic text-primary text-lg md:text-xl mb-2">
            {t(hero?.eyebrow)}
          </p>

          <h1 className="text-5xl sm:text-6xl md:text-8xl font-serif font-extrabold text-ink leading-[1.05] tracking-wider font-display drop-shadow-md md:drop-shadow-none">
            {t(hero?.title)}
          </h1>

          <p className="text-lg sm:text-xl md:text-2xl tracking-[0.35em] text-ink/70 md:text-ink/50 mt-3 font-display">
            {t(hero?.subtitle)}
          </p>

          <div className="flex items-center justify-center md:justify-start gap-3 mt-5">
            <span className="w-8 h-[1px] bg-primary/60 md:bg-primary/40" />
            <p className="text-primary text-xs tracking-[0.3em] uppercase font-sans font-medium">
              {t(hero?.slogan)}
            </p>
            <span className="w-8 h-[1px] bg-primary/60 md:bg-primary/40" />
          </div>

          <p className="text-ink/90 md:text-ink/70 mt-6 max-w-md mx-auto md:mx-0 leading-relaxed font-sans text-base">
            {t(hero?.description)}
          </p>

          <div className="flex flex-col sm:flex-row justify-center md:justify-start gap-4 mt-8 w-full sm:w-auto">
            {ctaPrimary.label && (
              <Button
                variant="primary"
                icon={ctaPrimary.icon}
                onClick={scrollTo(ctaPrimary.href)}
                className="w-full sm:w-auto justify-center"
              >
                {t(ctaPrimary.label)}
              </Button>
            )}
            {ctaSecondary.label && (
              <Button
                variant="outline"
                icon={ctaSecondary.icon}
                onClick={scrollTo(ctaSecondary.href)}
                className="w-full sm:w-auto justify-center"
              >
                {t(ctaSecondary.label)}
              </Button>
            )}
          </div>
        </motion.div>

        <div className="hidden md:block" />
      </div>

      {/* 3. Info strip */}
      {infoItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="max-w-6xl mx-auto mt-20 border border-primary/15 rounded-xl bg-surface/90 md:bg-surface/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 md:p-2 relative z-10 backdrop-blur-sm"
        >
          {infoItems.map(({ icon: iconName, title, subtitle }, index) => {
            const Icon = icon(iconName)
            return (
              <div
                key={index}
                className={`flex items-center gap-4 px-6 py-4 ${
                  index !== infoItems.length - 1 ? 'md:border-r border-ink/10' : ''
                } ${index % 2 === 0 ? 'sm:border-r-0 md:border-r' : ''}`}
              >
                {Icon && (
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Icon size={22} />
                  </div>
                )}
                <div>
                  <p className="text-ink text-sm font-semibold font-sans">{t(title)}</p>
                  <p className="text-ink/60 md:text-ink/50 text-xs font-sans mt-0.5">{t(subtitle)}</p>
                </div>
              </div>
            )
          })}
        </motion.div>
      )}
    </section>
  )
}
