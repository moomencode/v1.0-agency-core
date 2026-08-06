import React, { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import SectionHeading from '../components/SectionHeading'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { stats } = SITE
const heading = stats?.heading || {}
const items = stats?.items || []

function useCountUp(target, { duration = 1600, decimals = 0, start = false }) {
  const [value, setValue] = useState(0)
  const raf = useRef()

  useEffect(() => {
    if (!start) return
    const from = 0
    const delta = target - from
    const startTime = performance.now()

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(from + delta * eased)
      if (progress < 1) raf.current = requestAnimationFrame(tick)
    }

    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [start, target, duration])

  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function StatItem({ item, index, inView }) {
  const display = useCountUp(Number(item.value) || 0, {
    decimals: item.decimals || 0,
    start: inView,
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="rounded-2xl border border-ink/10 bg-surface/50 p-7 text-center"
    >
      <p className="text-4xl md:text-5xl font-serif font-extrabold text-primary">
        {display}
        {item.suffix && <span className="text-2xl md:text-3xl">{t(item.suffix)}</span>}
      </p>
      {item.label && (
        <p className="text-ink/60 text-xs md:text-sm uppercase tracking-widest font-sans mt-3">
          {t(item.label)}
        </p>
      )}
    </motion.div>
  )
}

/**
 * Stats.jsx
 * Animated counter strip. Data from config/stats.json.
 * Optional module — add "stats" to business.sections to enable.
 */
export default function Stats() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  if (items.length === 0) return null

  return (
    <section id="stats" className="py-24 md:py-32 px-5 md:px-10 bg-base">
      <div className="max-w-6xl mx-auto">
        <SectionHeading eyebrow={t(heading.eyebrow)} title={t(heading.title)} />

        <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item, i) => (
            <StatItem key={item.id || i} item={item} index={i} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  )
}
