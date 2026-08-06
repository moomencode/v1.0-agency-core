# Digital Presence Report — {{business.name}}

Digital grade: **{{grades.digital}}** ({{scores.digital}}/100) — presence score {{scores.presence}}

## Website

- URL: {{website.url}}
- Status: **{{website.status}}**
- Probe: {{website.probe}}
- Booking: {{website.booking}}
- Estimated pages: {{website.pages}}

## SEO

- SEO score: {{seo.seoScore}}
- Title: {{seo.title}}
- Meta: {{seo.metaDescription}}
- H1: {{seo.h1}}
- Keywords: {{seo.keywords}}

## Social

- Platforms: {{social.platforms}}
- Google Business: {{social.googleBusiness}}

## Reviews & Photos

- Reviews: {{reviews.count}} (rating {{reviews.rating}}) — {{reviews.reviewQuality}}
- Photos: {{photos.count}} ({{photos.adequacy}})

## Recommendations

{{#each recommendations}}
- ({{_item.priority}}) {{_item.title}} — {{_item.detail}}
{{/each}}
