import React from 'react'
import { motion } from 'framer-motion'

/**
 * SectionHeading.jsx
 * Consistent section header: eyebrow + title + gold diamond divider.
 * Pure presentational component — text comes from config via props.
 */
export default function SectionHeading({ eyebrow, title, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
      className={`text-center mb-12 ${className}`}
    >
      {eyebrow && (
        <p className="text-primary font-body text-sm font-semibold uppercase tracking-widest mb-2">
          {eyebrow}
        </p>
      )}

      <h2 className="text-3xl md:text-4xl font-bold font-display text-ink light:text-ink mt-2 transition-colors duration-300">
        {title}
      </h2>

      <div className="gold-diamond mt-5"><span></span></div>
    </motion.div>
  )
}
