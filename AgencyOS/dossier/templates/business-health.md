# Business Health Report — {{business.name}}

Health grade: **{{grades.health}}** (business score {{scores.business}}/100)

## Strengths

{{#each strengths}}
- **{{_item.title}}** — evidence: {{_item.evidence}} (weight {{_item.weight}})
{{/each}}

## Weaknesses

{{#each weaknesses}}
- **{{_item.title}}** ({{_item.severity}}) — {{_item.impact}} [{{_item.evidence}}]
{{/each}}

## Risks

{{#each risks}}
- **{{_item.title}}** ({{_item.level}}) — mitigation: {{_item.mitigation}}
{{/each}}

## Recommendations

{{#each recommendations}}
- ({{_item.priority}}) {{_item.title}} — {{_item.detail}}
{{/each}}
