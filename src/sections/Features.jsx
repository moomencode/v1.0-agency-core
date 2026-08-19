import React from 'react'
import { motion } from 'framer-motion'
import SectionHeading from '../components/SectionHeading'
import { SITE } from '../core/site'
import { icon } from '../core/icons'
import { t } from '../core/i18n'

const { features } = SITE
const heading = features?.heading || {}
const items = features?.items || []

/**
 * Features.jsx
 * Why-Choose-Us grid with icon. Data from config/features.json.
 * Optional module — add "features" to business.sections to enable.
 */
export default function Features() {
  if (items.length === 0) return null

  return (
    <section id="features" className="py-24 md:py-32 px-5 md:px-10 bg-base-deep">
      <div className="max-w-6xl mx-auto">
        <SectionHeading eyebrow={t(heading.eyebrow)} title={t(heading.title)} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, i) => {
            const Icon = icon(item.icon)
            return (
              <motion.div
                key={item.id || i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="group rounded-2xl border border-ink/10 bg-surface/40 p-7 text-center hover:border-primary/50 hover:shadow-elevated hover:-translate-y-1 transition-all duration-500 ease-premium"
              >
                {Icon && (
                  <div className="p-3.5 rounded-full bg-primary/10 text-primary w-fit mx-auto mb-5 group-hover:bg-primary group-hover:text-base transition-colors duration-500">
                    <Icon size={26} />
                  </div>
                )}
                <h3 className="text-ink font-serif font-bold text-xl mb-2">{t(item.title)}</h3>
                {item.text && (
                  <p className="text-ink/60 text-sm font-sans leading-relaxed">{t(item.text)}</p>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
