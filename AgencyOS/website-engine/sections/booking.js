import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Button } from '../components/index.js';

export default function buildBooking(ctx) {
  const cfg = ctx.configs['booking.json'];
  const contact = ctx.configs['contact.json'] || {};
  if (!cfg || cfg.enabled === false) return null;
  const waRaw = contact.phoneRaw || null;
  const wa = ctx.configs['social.json']?.whatsapp || (waRaw ? `https://wa.me/${waRaw.replace(/\D/g, '')}` : null);
  const method = cfg.method || 'whatsapp';
  const useWhatsapp = method === 'whatsapp' && wa;
  const fields = cfg.fields || {};

  const form = el('form', {
    className: 'form',
    'data-booking-form': '',
    'data-whatsapp': useWhatsapp ? wa : '',
    novalidate: ''
  }, [
    el('div', { className: 'form__row' }, [
      el('label', { className: 'form__label', htmlFor: 'booking-guests' }, [text(fields.guestsLabel || 'Number of Guests')]),
      el('input', { id: 'booking-guests', name: 'guests', type: 'number', min: '1', max: String(cfg.maxGuests || 20), placeholder: fields.guestsPlaceholder || 'Number of Guests', className: 'form__input', required: '' })
    ]),
    el('div', { className: 'form__row' }, [
      el('label', { className: 'form__label', htmlFor: 'booking-date' }, [text(fields.dateLabel || 'Preferred Date')]),
      el('input', { id: 'booking-date', name: 'date', type: 'date', className: 'form__input', required: '' })
    ]),
    el('div', { className: 'form__row' }, [
      el('label', { className: 'form__label', htmlFor: 'booking-phone' }, [text(fields.phoneLabel || 'Phone')]),
      el('input', { id: 'booking-phone', name: 'phone', type: 'tel', inputmode: 'numeric', pattern: '[0-9+\\s-]{7,15}', placeholder: fields.phonePlaceholder || 'Phone Number', className: 'form__input', required: '' })
    ]),
    Button({ label: cfg.submit?.label || 'Book Now', iconName: cfg.submit?.icon || 'calendar-check', type: 'submit' }),
    cfg.note ? el('p', { className: 'form__note' }, [text(cfg.note)]) : null
  ]);

  const info = [];
  if (contact.hours && contact.hours.length) {
    info.push(el('div', { className: 'contact__row' }, [icon('clock'), el('div', {}, [el('strong', {}, [text('Opening Hours')]), el('ul', { className: 'contact__hours' }, contact.hours.slice(0, 4).map((h) => el('li', {}, [el('span', {}, [text(h.days)]), el('span', {}, [text(h.time)])])))])]));
  }
  if (contact.phone) info.push(el('div', { className: 'contact__row' }, [icon('phone'), el('div', {}, [el('strong', {}, [text('Call Us')]), el('span', {}, [text(contact.phone)])])]));
  if (contact.address) info.push(el('div', { className: 'contact__row' }, [icon('map-pin'), el('div', {}, [el('strong', {}, [text('Visit Us')]), el('span', {}, [text(contact.address)])])]));

  return Section({ id: 'reservation', name: 'booking', variant: 'alt', ariaLabel: 'Booking' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'Book Your Spot', title: cfg.heading?.title || 'Book your slot now' }),
      el('div', { className: 'booking__grid' }, [
        el('div', { className: 'booking__info' }, info),
        el('div', {}, [form])
      ])
    ])
  ]);
}
