const I = {
  'star': '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/>',
  'sparkles': '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'wifi': '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="19" r="0.6"/>',
  'utensils-crossed': '<path d="M7 3v8"/><path d="M4 3c0 4 1.5 6 3 8v10"/><path d="M7 3c0 2.5-1 4-1.5 5"/><path d="M17 3v18"/><path d="M17 3c2 2 3 6 3 10h-3"/>',
  'shopping-bag': '<path d="M6 7h12l1 14H5z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
  'party-popper': '<path d="M5.8 11.4L2 15.2l3.8 3.8 3.8-3.8z"/><path d="M11.2 6l-3.8 3.8L18.2 20.8 22 17z"/><path d="M8 8c4-6 8-6 12-6 0 4 0 8-6 12"/><path d="M14 6l2-2"/><path d="M9.5 10.5l3.5 3.5"/>',
  'coffee': '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M7 3l1 2M11 3l1 2M15 3l1 2"/>',
  'heart': '<path d="M12 21C7 16.5 3 13 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 4-4 7.5-9 12z"/>',
  'chef-hat': '<path d="M7 20h10"/><path d="M7 16h10"/><path d="M6 16a4 4 0 0 1-1-7.8 6 6 0 0 1 11.7-1.3A4.5 4.5 0 0 1 18 16z"/>',
  'rocket': '<path d="M12 3c3 1 5.5 3.5 6.5 7.5l2 5-3 1-1.5-3A12 12 0 0 1 8 13.5l-1.5 3-3-1 2-5C6.5 6.5 9 4 12 3z"/><circle cx="12" cy="10" r="2"/>',
  'dumbbell': '<path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 8h10M7 16h10M4 10l3-2M4 14l3 2M20 10l-3-2M20 14l-3 2"/>',
  'id-card': '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5.5 16a2.5 2.5 0 0 1 5 0"/><path d="M14 9h5M14 12h5M14 15h3"/>',
  'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14.5a6.5 6.5 0 0 1 4 6"/>',
  'medal': '<circle cx="12" cy="9" r="5"/><path d="M9.5 13.5L8 21l4-2 4 2-1.5-7.5"/>',
  'scissors': '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.5L20 19M8.5 16.5L20 5"/>',
  'ruler': '<path d="M3 8l4-4 14 14-4 4z"/><path d="M7 4l3 3M10 7l2 2M13 10l2 2M16 13l3 3"/>',
  'needle': '<path d="M3 21l7-7"/><path d="M13.5 3.5l7 7-5 5c-2.5-2-4-4-7-7z"/><circle cx="19" cy="5" r="1.5"/>',
  'layers': '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
  'badge-check': '<path d="M12 2l2.4 1.8 3-.4 1.2 2.8 2.6 1.5-.9 2.9.9 2.9-2.6 1.5-1.2 2.8-3-.4L12 22l-2.4-1.8-3 .4-1.2-2.8L2.8 16.4l.9-2.9-.9-2.9L5.4 9.1l1.2-2.8 3 .4z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  'headset': '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2v-6z"/><path d="M20 14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2v-6z"/>',
  'truck': '<path d="M2 6h11v10H2z"/><path d="M13 9h4l3 3v4h-7z"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  'store': '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/><path d="M9 20v-5h6v5"/>',
  'pill': '<path d="M10.5 4.5l9 9a4.5 4.5 0 0 1-6.4 6.4l-9-9a4.5 4.5 0 0 1 6.4-6.4z"/><path d="M9.5 7l7.5 7.5"/>',
  'stethoscope': '<path d="M5 3v6a6 6 0 0 0 12 0V3"/><path d="M5 3h1.5M17 3h1.5"/><path d="M5 9h2M17 9h2"/><path d="M11 15a5 5 0 0 0 10 0v-1"/>',
  'activity': '<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>',
  'shield-check': '<path d="M12 2l8 3v6c0 5.5-3.5 9.5-8 11-4.5-1.5-8-5.5-8-11V5z"/><path d="M8.5 11.5l2.5 2.5 4.5-5"/>',
  'flower': '<circle cx="12" cy="12" r="3"/><path d="M12 6a3 3 0 1 1 5.2-2.1A3 3 0 1 1 18 12a3 3 0 1 1 2.2 5.2A3 3 0 1 1 12 18a3 3 0 1 1-5.2 2.1A3 3 0 1 1 6 12a3 3 0 1 1-2.2-5.2A3 3 0 1 1 12 6z"/>',
  'hand': '<path d="M7 11V5a1.5 1.5 0 0 1 3 0v5"/><path d="M10 10V4a1.5 1.5 0 0 1 3 0v6"/><path d="M13 10V6a1.5 1.5 0 0 1 3 0v6"/><path d="M16 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a7 7 0 0 1-6.2-3.6L3 15.5A1.5 1.5 0 0 1 5 13.5l2 2.5"/>',
  'razor': '<path d="M7 17l-4 4"/><path d="M9 4h8l3 3-7 7-7-7z"/><path d="M12 4v4M16 4v2"/>',
  'droplet': '<path d="M12 3s6.5 6.5 6.5 11a6.5 6.5 0 0 1-13 0C5.5 9.5 12 3 12 3z"/>',
  'sunrise': '<path d="M12 4v7"/><path d="M6 6l2 2M18 6l-2 2"/><path d="M3 17h18"/><path d="M7 21h10"/><path d="M8 17l4-4 4 4"/>',
  'croissant': '<path d="M4 9l2.5-1 3.5-1.5L12 5l2 1.5L17.5 8 20 9l-2.5 3.5L15 15l-3 2.5L9 15l-2.5-2.5z"/><path d="M6 6.5C5 8 4.5 10 5 12M18 6.5c1 1.5 1.5 3.5 1 5.5M12 4V3M12 20v-1"/>',
  'cake': '<path d="M4 20h16"/><path d="M5 20v-6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6"/><path d="M12 11V8"/><path d="M9 8h6l1.5-2.5a2 2 0 1 0-3-2L12 5l-1.5-.5a2 2 0 1 0-3 2z"/>',
  'book-heart': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M12 8.5c-1-1.5-3.5-1-3.5.5 0 1.5 3.5 3 3.5 3s3.5-1.5 3.5-3c0-1.5-2.5-2-3.5-.5z"/>',
  'search': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>',
  'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
  'x': '<path d="M6 6l12 12M18 6L6 18"/>',
  'arrow-right': '<path d="M4 12h16"/><path d="M14 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'check': '<path d="M4 12.5l5 5L20 6.5"/>',
  'quote': '<path d="M9 7c-3 0-5 2-5 5v5h5v-5H6.5C6.5 9.5 7.5 8.5 9 8z"/><path d="M20 7c-3 0-5 2-5 5v5h5v-5h-2.5c0-1.5 1-2.5 2.5-3z"/>',
  'phone': '<path d="M5 4h4l1.5 4L8 10a12 12 0 0 0 6 6l2-2.5 4 1.5v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4z"/>',
  'mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  'calendar-check': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>',
  'moon': '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'external': '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  'message-circle': '<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5z"/>',
  'play': '<path d="M7 5l12 7-12 7z"/>'
};

export const ICON_NAMES = Object.keys(I).sort();

export function iconSvg(name, { size = null, className = '' } = {}) {
  const d = I[name];
  if (!d) return null;
  const style = size ? ` style="width:${size};height:${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="var(--icon-stroke, 1.8)" stroke-linecap="round" stroke-linejoin="round"${style}${className ? ` class="${className}"` : ''} aria-hidden="true">${d}</svg>`;
}

export function iconPaths(name) {
  return I[name] || null;
}
