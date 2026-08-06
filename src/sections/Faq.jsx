import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { faq } = SITE
const heading = faq?.heading || {}
const items = faq?.items || []

/**
 * Faq.jsx
 * Accordion of questions. Data from config/faq.json.
 * Optional module — add "faq" to business.sections to enable.
 */
export default function Faq() {
  const [open, setOpen] = useState(null)
  if (items.length === 0) return null

  return (
    <section id="faq" className="py-24 md:py-32 px-5 md:px-10 bg-base">
      <div className="max-w-3xl mx-auto">
        <SectionHeading eyebrow={t(heading.eyebrow)} title={t(heading.title)} />

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = open === item.id
            return (
              <motion.div
                key={item.id || i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className={`rounded-xl border transition-colors duration-300 ${
                  isOpen ? 'border-primary/40 bg-surface/60' : 'border-ink/10 bg-surface/40'
                }`}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : item.id)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-ink font-serif font-bold text-sm md:text-base">
                    {t(item.question)}
                  </span>
                  <span
                    className={`p-1.5 rounded-full shrink-0 transition-colors duration-300 ${
                      isOpen ? 'bg-primary text-base' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-5 text-ink/70 text-sm font-sans leading-relaxed">
                        {t(item.answer)}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
