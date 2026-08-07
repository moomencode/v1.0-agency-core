import { hashCode } from '../utils.js';

const PALETTE = [
  [36, 30, 44], [30, 32, 44], [38, 28, 26], [32, 38, 34], [44, 38, 30],
  [28, 36, 42], [40, 32, 40], [34, 34, 38]
];

export function placeholderSvg({ kind = 'image', label = 'Placeholder', seed = 'site', width = 800, height = 600 }) {
  const [r, g, b] = PALETTE[hashCode(`${seed}:${kind}`) % PALETTE.length];
  const text = String(label).slice(0, 40);
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="rgb(${r},${g},${b})"/>`,
    `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" stroke-dasharray="6 8"/>`,
    `<text x="50%" y="48%" fill="rgba(255,255,255,0.82)" font-family="system-ui, sans-serif" font-size="34" font-weight="600" text-anchor="middle" dominant-baseline="middle">${safe}</text>`,
    `<text x="50%" y="56%" fill="rgba(255,255,255,0.4)" font-family="system-ui, sans-serif" font-size="18" text-anchor="middle" dominant-baseline="middle">image placeholder</text>`,
    `</svg>`
  ].join('\n');
}

export function placeholderName(kind, index = 1) {
  return `placeholder-${kind}-${index}.svg`;
}

const KIND_HINTS = {
  gallery: 'gallery',
  food: 'food',
  hero: 'hero',
  logo: 'logo',
  avatar: 'avatar'
};

export function kindForPath(path) {
  if (/\/gallery\//.test(path)) return 'gallery';
  if (/\/food\//.test(path)) return 'food';
  if (/\/hero\//.test(path)) return 'hero';
  if (/\/logo\//.test(path)) return 'logo';
  if (/\/placeholders\//.test(path)) return 'placeholder';
  return 'image';
}
