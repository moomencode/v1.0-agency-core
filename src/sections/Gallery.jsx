import React from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { gallery } = SITE
const heading = gallery?.heading || {}
const images = gallery?.images || []

/**
 * Gallery.jsx
 * Horizontal strip of photos ("A glimpse of our place").
 * Uses a simple responsive grid; on very small screens it becomes
 * a horizontally scrollable row so nothing gets cropped awkwardly.
 * Data comes from config/gallery.json.
 */
export default function Gallery() {
  if (images.length === 0) return null

  return (
    <section id="gallery" className="py-24 md:py-32 px-5 md:px-10 bg-base-deep">
      <div className="max-w-7xl mx-auto">
        <SectionHeading eyebrow={t(heading.eyebrow)} title={t(heading.title)} />

        <div className="relative">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {images.map((item, i) => {
              const src = typeof item === 'string' ? item : item?.src
              const alt = typeof item === 'string' ? `Gallery ${i + 1}` : t(item?.alt) || `Gallery ${i + 1}`
              return (
                <motion.div
                  key={src || i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="group rounded-xl overflow-hidden border border-ink/10 hover:border-primary/50 hover:shadow-elevated transition-all duration-500 ease-premium aspect-[4/5]"
                >
                  <img src={src} alt={alt} loading="lazy" className="w-full h-full object-cover transition-transform duration-700 ease-premium group-hover:scale-105" />
                </motion.div>
              )
            })}
          </div>

          {/* Decorative "next" arrow to hint at more photos */}
          <button
            aria-label={t(gallery?.moreAria) || 'More photos'}
            className="hidden lg:flex absolute -right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-primary text-base items-center justify-center shadow-primary"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </section>
  )
}
