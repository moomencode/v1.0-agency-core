import { el, text } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Card, StarRow } from '../components/index.js';

export default function buildTestimonials(ctx) {
  const cfg = ctx.configs['reviews.json'];
  if (!cfg || !Array.isArray(cfg.items) || !cfg.items.length) return null;
  const items = cfg.items.slice(0, 6).map((r) =>
    Card({ className: 'review' }, [
      StarRow(clampRating(r.rating)),
      el('p', { className: 'review__text' }, [text(r.text || '')]),
      el('div', {}, [
        el('div', { className: 'review__name' }, [text(r.name || 'Guest')]),
        r.role ? el('div', { className: 'review__role' }, [text(r.role)]) : null
      ])
    ])
  );
  return Section({ id: 'testimonials', name: 'testimonials', variant: 'alt', ariaLabel: 'Testimonials' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'Testimonials', title: cfg.heading?.title || 'What our clients say' }),
      el('div', { className: 'reviews__grid' }, items)
    ])
  ]);
}

function clampRating(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(5, Math.round(n)));
}
