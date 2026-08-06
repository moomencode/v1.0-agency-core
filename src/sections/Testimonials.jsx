import React from 'react'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { reviews } = SITE
const heading = reviews?.heading || {}
const items = reviews?.items || []

function Stars({ count }) {
  return (
    <div className="flex gap-1 text-primary">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={16}
          className={n <= (count || 0) ? 'fill-primary' : 'opacity-25'}
        />
      ))}
    </div>
  )
}

/**
 * Testimonials.jsx
 * Guest reviews grid. Data from config/reviews.json.
 * Optional module — add "testimonials" to business.sections to enable.
 */
export default function Testimonials() {
  if (items.length === 0) return null

  return (
    <section id="testimonials" className="py-24 md:py-32 px-5 md:px-10 bg-base-deep">
      <div className="max-w-6xl mx-auto">
        <SectionHeading eyebrow={t(heading.eyebrow)} title={t(heading.title)} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <motion.div
              key={item.id || i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="rounded-2xl border border-ink/10 bg-surface/50 p-7 hover:border-primary/40 hover:shadow-elevated transition-all duration-500 ease-premium"
            >
              <Stars count={item.rating} />
              <p className="text-ink/80 text-sm font-sans leading-relaxed mt-4 italic">
                "{t(item.text)}"
              </p>
              <div className="mt-6 pt-4 border-t border-ink/10">
                <p className="text-ink font-serif font-bold text-sm">{t(item.name)}</p>
                {item.role && (
                  <p className="text-primary text-xs uppercase tracking-widest font-sans mt-0.5">
                    {t(item.role)}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
