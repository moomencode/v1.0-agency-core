# Opportunity Report — {{business.name}}

Opportunity score: **{{scores.opportunity}}/100** — {{business.priorityTier}} priority

## Positioning

{{competitors.positioning}}

## Market Gap

{{competitors.marketGap}}

## Digital Comparison

| | Score |
|---|---|
| {{business.name}} | {{competitors.ownScore}} |
| Local average | {{competitors.peerAverage}} |
| Rank | #{{competitors.rank}} of {{competitors.of}} |

## Competitors

{{#each competitors.list}}
- {{_item.name}} — digital {{_item.digitalScore}}/100 — weaknesses: {{_item.weaknesses}}
{{/each}}

## Opportunities

{{#each opportunities}}
- ({{_item.priority}}, {{_item.potential}} potential / {{_item.effort}} effort) {{_item.title}}
{{/each}}

## Estimated Deal

Sales value ${{estimates.salesValue}} at ROI {{estimates.roi}} (closing {{estimates.closingProbability}})
