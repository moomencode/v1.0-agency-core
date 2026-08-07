export function generateLocalization(n, sections) {
  const labels = {
    nav: {
      ariaOpen: 'Open menu',
      ariaClose: 'Close menu',
      home: 'Home'
    },
    theme: { aria: 'Toggle dark/light mode' },
    common: {
      yes: 'Yes',
      no: 'No',
      viewMenu: 'View Menu',
      bookNow: 'Book Now',
      contactUs: 'Contact Us',
      more: 'More',
      rating: 'Rating',
      reviews: 'Reviews'
    },
    sections: {}
  };

  for (const s of sections.plan) {
    if (!s.enabled) continue;
    labels.sections[s.id] = {
      label: s.label,
      anchor: s.anchor
    };
  }

  return {
    businessId: n.id,
    locale: 'en',
    languages: ['en', 'ar'],
    labels
  };
}
