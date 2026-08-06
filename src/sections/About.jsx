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
 * About.jsx
 * "Why choose us" feature grid. Data from config/features.json.
 * Optional module — render it by adding "about" to business.sections.
 */
export default function About() {
  if (items.length === 0) return null

  return (
    <section id="about" className="py-24 md:py-32 px-5 md:px-10 bg-base">
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
                className="rounded-2xl border border-ink/10 bg-surface/50 p-7 hover:border-primary/40 hover:shadow-elevated hover:-translate-y-1 transition-all duration-500 ease-premium"
              >
                {Icon && (
                  <div className="p-3 rounded-xl bg-primary/10 text-primary w-fit mb-5">
                    <Icon size={24} />
                  </div>
                )}
                <h3 className="text-ink font-serif font-bold text-lg mb-2">{t(item.title)}</h3>
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
