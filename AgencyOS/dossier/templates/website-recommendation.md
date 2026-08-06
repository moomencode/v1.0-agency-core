# Website Recommendation Report — {{business.name}}

Website status: **{{website.status}}** — digital grade {{grades.digital}}

## Website Recommendations

{{#each websiteRecs}}
- ({{_item.priority}}) {{_item.title}} — {{_item.detail}}
{{/each}}

## SEO Recommendations

{{#each seoRecs}}
- ({{_item.priority}}) {{_item.title}} — {{_item.detail}}
{{/each}}

## Conversion Recommendations

{{#each conversionRecs}}
- ({{_item.priority}}) {{_item.title}} — {{_item.detail}}
{{/each}}

## Build Estimate

- Pages: {{website.pages}}
- Cost: ${{estimates.devCost}}
- Value: ${{estimates.websiteValue}}
- Timeline note: build cost and pages are estimates from the decision engine; the Website Production Pipeline refines them.

## Why This Business

{{headline}}
