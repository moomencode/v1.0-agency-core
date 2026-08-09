import { el, text, icon } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Link } from '../components/index.js';

export default function buildContact(ctx) {
  const cfg = ctx.configs['contact.json'];
  if (!cfg) return null;
  const social = ctx.configs['social.json'] || {};
  const rows = [];
  if (cfg.phone) rows.push(el('div', { className: 'contact__row' }, [icon('phone'), el('div', {}, [el('strong', {}, [text('Phone')]), el('span', {}, [text(cfg.phone)])])]));
  if (cfg.whatsapp) rows.push(el('div', { className: 'contact__row' }, [icon('message-circle'), el('div', {}, [el('strong', {}, [text('WhatsApp')]), el('span', {}, [text(cfg.whatsapp)])])]));
  if (cfg.email) rows.push(el('div', { className: 'contact__row' }, [icon('mail'), el('div', {}, [el('strong', {}, [text('Email')]), el('span', {}, [text(cfg.email)])])]));
  if (cfg.address) rows.push(el('div', { className: 'contact__row' }, [icon('map-pin'), el('div', {}, [el('strong', {}, [text('Address')]), el('span', {}, [text(cfg.address)])])]));
  if (cfg.hoursShort) rows.push(el('div', { className: 'contact__row' }, [icon('clock'), el('div', {}, [el('strong', {}, [text('Hours')]), el('span', {}, [text(cfg.hoursShort)])])]));

  const socialLinks = Object.entries(social)
    .filter(([, url]) => url)
    .map(([platform, url]) => Link({ href: url, external: true, ariaLabel: platform, className: 'nav__link' }, [text(platform)]));

  const children = [];
  children.push(SectionHeader({ eyebrow: 'Get in touch', title: 'Contact us' }));
  children.push(el('div', { className: 'contact__grid' }, [
    el('div', {}, [...rows, socialLinks.length ? el('div', { style: 'display:flex;gap:var(--space-md);margin-top:var(--space-md)' }, socialLinks) : null]),
    cfg.mapsUrl ? el('div', {}, [
      el('strong', {}, [text('Find us on the map')]),
      Link({ href: cfg.mapsUrl, external: true, ariaLabel: 'Open map in new tab' }, [
        el('img', { src: cfg.mapImage || '/backgrounds/map-dark.png', alt: 'Map', className: 'img--cover map-frame', width: '600', height: '320' })
      ])
    ]) : null
  ]));
  return Section({ id: 'contact', name: 'contact', ariaLabel: 'Contact' }, [Container({}, children)]);
}
