import { el, text } from '../renderer/tree.js';
import { Section, Container, SectionHeader, Image } from '../components/index.js';

export default function buildTeam(ctx) {
  const cfg = ctx.configs['team.json'];
  if (!cfg || !Array.isArray(cfg.members) || !cfg.members.length) return null;
  const members = cfg.members.slice(0, 8).map((m) =>
    el('div', { className: 'team__card card', id: `team-${m.id || m.name}` }, [
      Image({ src: m.photo || '/placeholders/profile.jpg', alt: m.name || 'Team member', className: 'team__avatar' }),
      el('h3', {}, [text(m.name || '')]),
      m.role ? el('div', { className: 'team__role' }, [text(m.role)]) : null
    ])
  );
  return Section({ id: 'team', name: 'team', ariaLabel: 'Our team' }, [
    Container({}, [
      SectionHeader({ eyebrow: cfg.heading?.eyebrow || 'Our Team', title: cfg.heading?.title || 'Meet the team' }),
      el('div', { className: 'team__grid' }, members)
    ])
  ]);
}
