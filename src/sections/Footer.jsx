import React from 'react'
import { Facebook, Instagram, MessageCircle, MapPin, Phone, Mail } from 'lucide-react'
import { useTheme } from '../Context/ThemeContext'
import { SITE } from '../core/site'
import { themedImage } from '../core/assets'
import { t } from '../core/i18n'

const { footer, navigation, social, contact, brand, business } = SITE

const QUICK_LINKS = footer?.quickLinks?.length
  ? footer.quickLinks
  : navigation?.items || []

const SOCIALS = [
  { icon: Facebook, key: 'facebook' },
  { icon: Instagram, key: 'instagram' },
  { icon: MessageCircle, key: 'whatsapp' },
].filter((item) => social?.[item.key])

export default function Footer() {
  const { theme } = useTheme()
  const name = brand?.name || business?.name || ''

  return (
    <footer id="footer" className="bg-base border-t border-ink/10 pt-20 md:pt-28 pb-8 px-5 md:px-10">
      <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-2 mb-4 group">
            <img
              src={themedImage(brand?.logo, theme)}
              alt={brand?.logo?.alt || name || 'Logo'}
              className="w-14 h-14 rounded-full object-cover contrast-125 transition-transform duration-500 ease-premium group-hover:scale-105"
              loading="eager"
            />
            <div>
              <p className="text-ink font-serif font-semibold tracking-wide">{brand?.shortName || name}</p>
              <p className="text-[10px] text-ink/60 tracking-[0.2em] uppercase font-sans">
                {brand?.tagline}
              </p>
            </div>
          </div>
          {footer?.brandDescription && (
            <p className="text-ink/70 text-sm leading-relaxed font-sans">
              {t(footer.brandDescription)}
            </p>
          )}
          {SOCIALS.length > 0 && (
            <div className="flex gap-3 mt-5">
              {SOCIALS.map(({ icon: Icon, key }, i) => (
                <a
                  key={i}
                  href={social[key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full border border-ink/20 flex items-center justify-center text-ink/60 hover:text-primary hover:border-primary transition-colors duration-300"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        {QUICK_LINKS.length > 0 && (
          <div>
            <h4 className="text-ink font-sans font-semibold mb-4 text-sm tracking-wide uppercase">
              {t(footer?.quickLinksTitle) || 'Quick Links'}
            </h4>
            <ul className="space-y-2">
              {QUICK_LINKS.map((link) => (
                <li key={link.href || link.label}>
                  <a
                    href={link.href}
                    className="text-ink/60 text-sm hover:text-primary transition-colors duration-300 font-sans"
                  >
                    {t(link.label)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Contact */}
        <div>
          <h4 className="text-ink font-sans font-semibold mb-4 text-sm tracking-wide uppercase">
            {t(footer?.contactTitle) || 'Contact Us'}
          </h4>
          <ul className="space-y-3 text-sm text-ink/70 font-sans">
            {contact?.address && (
              <li className="flex items-start gap-2">
                <MapPin className="text-primary shrink-0 mt-0.5" size={16} />
                <span>{t(contact.address)}</span>
              </li>
            )}
            {contact?.phone && (
              <li className="flex items-center gap-2">
                <Phone className="text-primary shrink-0" size={16} />
                <span>{t(contact.phone)}</span>
              </li>
            )}
            {contact?.email && (
              <li className="flex items-center gap-2">
                <Mail className="text-primary shrink-0" size={16} />
                <span>{t(contact.email)}</span>
              </li>
            )}
          </ul>
        </div>

        {/* Opening hours */}
        {contact?.hours?.length > 0 && (
          <div>
            <h4 className="text-ink font-sans font-semibold mb-4 text-sm tracking-wide uppercase">
              {t(footer?.hoursTitle) || 'Opening Hours'}
            </h4>
            {contact.hours.map((h, i) => (
              <div key={i}>
                <p className="text-ink/70 text-sm font-sans">{t(h.days)}</p>
                <p className="text-primary text-sm font-semibold font-sans mt-1">{t(h.time)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto border-t border-ink/10 mt-12 pt-6 text-center text-ink/40 text-xs font-sans">
        © {new Date().getFullYear()} {name}. {t(footer?.rights) || 'All rights reserved.'}
      </div>
    </footer>
  )
}
