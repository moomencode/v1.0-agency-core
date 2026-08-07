import { el, text, icon } from '../renderer/tree.js';
import { Container, Link } from '../components/index.js';

export default function buildFooter(ctx) {
  const cfg = ctx.configs['footer.json'];
  const brand = ctx.configs['brand.json'] || {};
  const nav = ctx.configs['navigation.json'];
  const contact = ctx.configs['contact.json'] || {};
  const social = ctx.configs['social.json'] || {};
  if (!cfg) return null;
  const quickLinks = (nav?.items || []).slice(0, 7).map((i) =>
    el('li', {}, [Link({ href: i.href || '#home' }, [text(i.label)])])
  );
  const socialEntries = Object.entries(social).filter(([, url]) => url);
  const socialLinks = socialEntries.length
    ? el('div', { className: 'footer__links', style: 'flex-direction:row' }, socialEntries.map(([p, url]) =>
        Link({ href: url, external: true, ariaLabel: `${p} profile` }, [text(p)])
      ))
    : null;
  const hours = Array.isArray(contact.hours) && contact.hours.length
    ? el('ul', { className: 'footer__links' }, contact.hours.slice(0, 4).map((h) => el('li', {}, [text(`${h.days}: ${h.time}`)])))
    : null;
  const columns = [
    el('div', {}, [
      el('div', { className: 'footer__brand', style: 'font-family:var(--font-display);font-weight:700;font-size:1.15rem' }, [text(brand.shortName || brand.name || '')]),
      el('p', { style: 'margin-top:var(--space-sm);font-size:0.9rem' }, [text(cfg.brandDescription || '')])
    ]),
    el('div', {}, [
      el('div', { className: 'footer__title' }, [text(cfg.quickLinksTitle || 'Quick Links')]),
      el('ul', { className: 'footer__links' }, quickLinks)
    ]),
    el('div', {}, [
      el('div', { className: 'footer__title' }, [text(cfg.contactTitle || 'Contact Us')]),
      el('ul', { className: 'footer__links' }, [
        contact.phone ? el('li', {}, [text(contact.phone)]) : null,
        contact.email ? el('li', {}, [Link({ href: `mailto:${contact.email}` }, [text(contact.email)])]) : null,
        contact.address ? el('li', {}, [text(contact.address)]) : null
      ]),
      socialLinks
    ]),
    hours ? el('div', {}, [
      el('div', { className: 'footer__title' }, [text(cfg.hoursTitle || 'Opening Hours')]),
      hours
    ]) : null
  ];
  return el('footer', { className: 'footer', id: 'footer', role: 'contentinfo' }, [
    Container({}, [
      el('div', { className: 'footer__grid' }, columns),
      el('div', { className: 'footer__bottom' }, [
        el('span', {}, [text(`© ${brand.name || ''} ${cfg.rights || 'All rights reserved.'}`.trim())]),
        el('span', {}, [text(`Built with AgencyOS Website Engine`)])
      ])
    ])
  ]);
}
