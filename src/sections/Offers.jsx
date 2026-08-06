import React from 'react'
import { motion } from 'framer-motion'
import SectionHeading from '../components/SectionHeading'
import Button from '../components/Button'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { offers } = SITE
const heading = offers?.heading || {}
const items = offers?.items || []

/**
 * Offers.jsx
 * Displays current promotions as clean bordered cards, each with a
 * badge (e.g. "15% OFF", "FREE") in the top-right corner.
 * Data comes from config/offers.json.
 */
export default function Offers() {
  if (items.length === 0) return null

  return (
    <section id="offers" className="py-24 md:py-32 px-5 md:px-10 bg-base-deep">
      <div className="max-w-6xl mx-auto">
        <SectionHeading eyebrow={t(heading.eyebrow)} title={t(heading.title)} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((offer, i) => (
            <motion.div
              key={offer.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative rounded-xl overflow-hidden border border-ink/10 bg-surface/40 hover:border-primary/50 hover:-translate-y-1 hover:shadow-elevated transition-all duration-500 ease-premium"
            >
              <div className="relative">
                <img src={offer.image} alt={t(offer.title)} className="w-full h-48 object-cover" />
                {offer.badge && (
                  <span className="absolute top-3 right-3 bg-primary text-base-deep text-xs font-bold px-3 py-1.5 rounded-full shadow">
                    {t(offer.badge)}
                  </span>
                )}
              </div>
              <div className="p-5 md:p-6">
                <h3 className="text-ink font-display font-semibold text-lg">
                  {t(offer.title)}
                </h3>
                <p className="text-ink-muted text-sm mt-1">{t(offer.description)}</p>
                {offer.time && <p className="text-primary text-sm mt-2 font-medium">{t(offer.time)}</p>}
              </div>
            </motion.div>
          ))}
        </div>

        {offers?.more?.label && (
          <div className="flex justify-center mt-12">
            <Button
              variant="outline"
              href={offers.more.href?.startsWith('#') ? undefined : offers.more.href}
              onClick={offers.more.href?.startsWith('#')
                ? (e) => {
                    e.preventDefault()
                    document.querySelector(offers.more.href)?.scrollIntoView({ behavior: 'smooth' })
                  }
                : undefined}
            >
              {t(offers.more.label)}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
