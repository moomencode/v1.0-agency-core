import React from 'react'
import { motion } from 'framer-motion'
import { MapPin, Clock, Phone, Navigation } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { contact, brand, business } = SITE

export default function LocationSection() {
  const name = brand?.name || business?.name || ''

  const locationDetails = [
    contact?.address && { title: 'Address', value: contact.addressShort || contact.address, icon: MapPin },
    contact?.hoursShort && { title: 'Working Hours', value: contact.hoursShort, icon: Clock },
    contact?.phone && { title: 'Reservations & Delivery', value: contact.phone, icon: Phone },
  ].filter(Boolean)

  const mapsUrl = contact?.mapsUrl || ''
  const mapsEmbed = contact?.mapsEmbed || ''

  return (
    <section id="location" className="py-24 md:py-32 px-5 md:px-10 bg-base border-t border-ink/5 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <SectionHeading eyebrow="Visit Us" title={`Where to Find ${brand?.shortName || name}`} />

        <div className="grid lg:grid-cols-3 gap-8 items-stretch mt-12">

          {/* 1. Details card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col justify-between gap-6 p-6 sm:p-8 rounded-2xl bg-surface/60 border border-ink/10 shadow-sm transition-colors duration-300"
          >
            <div>
              <h3 className="text-ink font-serif font-bold text-xl md:text-2xl mb-2">
                {name}
              </h3>
              <p className="text-ink/60 text-sm font-sans leading-relaxed">
                {t(brand?.description)}
              </p>
            </div>

            <div className="space-y-4 my-2">
              {locationDetails.map((item, index) => {
                const Icon = item.icon
                return (
                  <div
                    key={index}
                    className="flex items-start gap-3.5 p-3 rounded-xl bg-base/50 border border-ink/5 transition-colors duration-300"
                  >
                    <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="text-primary font-sans font-bold text-xs uppercase tracking-wider">
                        {t(item.title)}
                      </h4>
                      <p className="text-ink/90 text-sm font-sans mt-0.5">
                        {t(item.value)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {mapsUrl && (
              <div>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-primary/10 text-primary font-sans font-bold text-sm border border-primary/30 hover:bg-primary hover:text-base transition-all duration-300 shadow-sm"
                >
                  <Navigation size={18} />
                  Get Directions on Google Maps
                </a>
              </div>
            )}
          </motion.div>

          {/* 2. Interactive map */}
          {mapsEmbed && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="lg:col-span-2 relative min-h-[350px] lg:min-h-full rounded-2xl overflow-hidden border border-primary/15 bg-surface/60 shadow-xl"
            >
              <iframe
                title={`${name} Location Map`}
                src={mapsEmbed}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '380px' }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full opacity-100"
              ></iframe>

              <div className="absolute inset-0 pointer-events-none border border-primary/10 rounded-2xl" />
            </motion.div>
          )}

        </div>
      </div>
    </section>
  )
}
