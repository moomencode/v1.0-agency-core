import React from 'react'
import { Phone, MessageCircle, Mail, MapPin, Clock, Navigation } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { contact, footer } = SITE

/**
 * Contact.jsx
 * Generic contact section — renders ONLY real contact data from
 * config/contact.json (phone, whatsapp, email, address, hours, map link).
 * Rendered whenever the business config declares `contact` in
 * config/business.json -> sections, so navigation's #contact anchor
 * (used by generated businesses) always resolves to a real section.
 */
export default function Contact() {
  const title = t(footer?.contactTitle) || 'Contact Us'

  const rows = [
    contact?.phoneRaw && { icon: Phone, label: 'Call Us', value: contact.phone || contact.phoneRaw, href: `tel:${contact.phoneRaw}` },
    contact?.whatsapp && { icon: MessageCircle, label: 'WhatsApp', value: contact.whatsapp, href: `https://wa.me/${String(contact.whatsapp).replace(/\D/g, '')}` },
    contact?.email && { icon: Mail, label: 'Email', value: contact.email, href: `mailto:${contact.email}` },
    contact?.address && { icon: MapPin, label: 'Address', value: contact.address },
  ].filter(Boolean)

  const hours = Array.isArray(contact?.hours) ? contact.hours.filter((h) => h && h.days && h.time) : []

  return (
    <section id="contact" className="py-24 md:py-32 px-5 md:px-10 bg-base border-t border-ink/10">
      <div className="max-w-5xl mx-auto">
        <SectionHeading eyebrow={null} title={title} />

        <div className="grid md:grid-cols-2 gap-4 items-start">
          <div className="flex flex-col gap-4">
            {rows.map(({ icon: Icon, label, value, href }, i) => (
              <a
                key={i}
                href={href || undefined}
                target={href && /^https?:\/\//.test(href) ? '_blank' : undefined}
                rel={href && /^https?:\/\//.test(href) ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-4 bg-surface/50 border border-ink/10 rounded-xl px-5 py-4 transition-colors hover:border-primary/50"
              >
                <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-ink/60 font-sans">
                    {t(label)}
                  </span>
                  <span className="block text-sm font-semibold text-ink truncate">{t(value)}</span>
                </span>
              </a>
            ))}
            {contact?.mapsUrl && (
              <a
                href={contact.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-surface/50 border border-ink/10 rounded-xl px-5 py-4 transition-colors hover:border-primary/50"
              >
                <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Navigation size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-ink/60 font-sans">
                    {t('Get Directions')}
                  </span>
                  <span className="block text-sm font-semibold text-ink truncate">{t(contact.mapsUrl)}</span>
                </span>
              </a>
            )}
          </div>

          {hours.length > 0 && (
            <div className="bg-surface/50 border border-ink/10 rounded-xl p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink mb-3">
                <Clock className="text-primary" size={16} />
                {t(footer?.hoursTitle) || 'Opening Hours'}
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {hours.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-ink/80">
                    <span>{t(h.days)}</span>
                    <span className="text-ink/60">{t(h.time)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}