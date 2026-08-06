import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Clock, Users, Search, Phone } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import Button from '../components/Button'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { booking, business, contact } = SITE
const heading = booking?.heading || {}
const fields = booking?.fields || {}
const phoneDigits = business?.phoneDigits || 11
const maxGuests = booking?.maxGuests || 20

/**
 * Reservation.jsx
 * Table-booking form with full input validation.
 * Labels, validation length and submit behavior are config-driven
 * (config/booking.json + config/business.json + config/contact.json).
 */
export default function Reservation() {
  const [form, setForm] = useState({ date: '', time: '', guests: '', phone: '' })
  const [phoneError, setPhoneError] = useState('')

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= phoneDigits) {
      setForm((prev) => ({ ...prev, phone: value }))
      if (phoneError) setPhoneError('')
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (form.phone.length !== phoneDigits) {
      setPhoneError(t(booking?.phoneError) || `Please enter a valid ${phoneDigits}-digit phone number`)
      return
    }

    // Delivery channel is configurable: "whatsapp" opens a wa.me link,
    // "console" keeps the original demo behavior.
    if (booking?.method === 'whatsapp') {
      const number = (booking.target || contact?.whatsapp || contact?.phoneRaw || '').replace(/\D/g, '')
      const message = encodeURIComponent(
        `Reservation request: ${form.date} at ${form.time} for ${form.guests} guests. Phone: ${form.phone}`
      )
      if (number) window.open(`https://wa.me/${number}?text=${message}`, '_blank', 'noopener')
    }

    // TODO: connect to real reservation API/backend.
    console.log('Reservation request:', form)
    alert(t(booking?.success) || 'Thanks! Your table request has been received.')
  }

  return (
    <section id="reservation" className="py-24 md:py-32 px-5 md:px-10 bg-base">
      <div className="max-w-5xl mx-auto">
        <SectionHeading eyebrow={t(heading.eyebrow)} title={t(heading.title)} />

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="bg-surface/50 border border-ink/10 rounded-xl p-5 md:p-6 grid md:grid-cols-2 lg:grid-cols-4 gap-4 items-start"
        >
          {/* Date field */}
          <label className="flex items-center gap-3 border border-ink/20 rounded-lg px-4 py-3 focus-within:border-primary transition-colors w-full">
            <CalendarDays className="text-primary shrink-0" size={18} />
            <input
              type="date"
              value={form.date}
              onChange={handleChange('date')}
              className="bg-transparent w-full text-ink text-sm outline-none placeholder:text-ink-muted [color-scheme:dark]"
              required
            />
          </label>

          {/* Time field */}
          <label className="flex items-center gap-3 border border-ink/20 rounded-lg px-4 py-3 focus-within:border-primary transition-colors w-full">
            <Clock className="text-primary shrink-0" size={18} />
            <input
              type="time"
              value={form.time}
              onChange={handleChange('time')}
              className="bg-transparent w-full text-ink text-sm outline-none placeholder:text-ink-muted [color-scheme:dark]"
              required
            />
          </label>

          {/* Number of guests */}
          <label className="flex items-center gap-3 border border-ink/20 rounded-lg px-4 py-3 focus-within:border-primary transition-colors w-full">
            <Users className="text-primary shrink-0" size={18} />
            <input
              type="number"
              min="1"
              max={maxGuests}
              placeholder={t(fields.guestsPlaceholder)}
              value={form.guests}
              onChange={handleChange('guests')}
              className="bg-transparent w-full text-ink text-sm outline-none placeholder:text-ink-muted"
              required
            />
          </label>

          {/* Phone Number field */}
          <div className="w-full flex flex-col">
            <label
              className={`flex items-center gap-3 border rounded-lg px-4 py-3 transition-colors ${
                phoneError ? 'border-red-500/80' : 'border-ink/20 focus-within:border-primary'
              }`}
            >
              <Phone className="text-primary shrink-0" size={18} />
              <input
                type="tel"
                placeholder={t(fields.phonePlaceholder)}
                value={form.phone}
                onChange={handlePhoneChange}
                className="bg-transparent w-full text-ink text-sm outline-none placeholder:text-ink-muted"
                required
              />
            </label>
            {phoneError && (
              <span className="text-red-400 text-[11px] mt-1 ml-1">{phoneError}</span>
            )}
          </div>

          {/* Submit Button */}
          <div className="md:col-span-2 lg:col-span-4 mt-2">
            <Button variant="primary" icon={Search} type="submit" className="w-full">
              {t(booking?.submit?.label) || 'Find a Table'}
            </Button>
          </div>

          {booking?.note && (
            <p className="md:col-span-2 lg:col-span-4 text-center text-ink-muted text-xs mt-1">
              {t(booking.note)}
            </p>
          )}
        </motion.form>
      </div>
    </section>
  )
}
