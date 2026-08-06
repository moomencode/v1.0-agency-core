import React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import Button from '../components/Button'
import { placeholderImage } from '../utils/placeholder'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { order, brand, business } = SITE

/**
 * OrderOnline.jsx
 * Promotional section encouraging online ordering, with a phone
 * mockup preview and a QR code placeholder.
 * All copy comes from config/order.json.
 */
export default function OrderOnline() {
  const features = order?.features || []
  const cta = order?.cta || {}
  const appName = brand?.shortName || brand?.name || business?.name || 'App'
  const appImage = order?.appImage || {}

  return (
    <section className="py-20 px-5 md:px-10 bg-surface/40">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        {/* Left: copy + features + CTA */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
        >
          <p className="eyebrow">{t(order?.eyebrow)}</p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mt-2 leading-snug">
            {t(order?.heading)}
          </h2>

          {features.length > 0 && (
            <ul className="mt-6 space-y-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-ink-muted text-sm md:text-base">
                  <CheckCircle2 className="text-primary shrink-0" size={18} />
                  {t(feature)}
                </li>
              ))}
            </ul>
          )}

          {cta.label && (
            <Button
              variant="primary"
              className="mt-8"
              href={cta.href?.startsWith('#') ? undefined : cta.href}
              onClick={cta.href?.startsWith('#')
                ? (e) => {
                    e.preventDefault()
                    document.querySelector(cta.href)?.scrollIntoView({ behavior: 'smooth' })
                  }
                : undefined}
            >
              {t(cta.label)}
            </Button>
          )}
        </motion.div>

        {/* Right: phone mockup + QR code */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex items-center justify-center gap-8"
        >
          <img
            src={placeholderImage(appImage.width || 280, appImage.height || 560, appName, '122a20', 'f4efe6')}
            alt={t(appImage.label) || `${appName} preview`}
            className="rounded-3xl border-4 border-surface-2 shadow-2xl max-w-[220px] md:max-w-[260px]"
          />
          <div className="hidden sm:flex flex-col items-center gap-3">
            <img
              src={placeholderImage(140, 140, 'QR', 'f4efe6', '0b1c15')}
              alt="QR code to view the menu"
              className="rounded-lg border border-ink/20"
            />
            <p className="text-ink-muted text-xs text-center max-w-[140px]">
              {t(order?.qrLabel) || 'Scan to view our menu or your table'}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
