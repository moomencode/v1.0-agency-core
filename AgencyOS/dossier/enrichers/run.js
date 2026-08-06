import { brandEnricher, competitorsEnricher, strengthsEnricher, weaknessesEnricher, opportunitiesEnricher, risksEnricher, digitalPresenceScore } from './index.js';
import { recommendationsEnricher } from './recommendations.js';

export function runEnrichers({ record, profile, digital, commerce, context, decision }) {
  const brand = brandEnricher(profile, digital, context);
  const strengths = strengthsEnricher(profile, digital, context);
  const weaknesses = weaknessesEnricher(context, record);
  const competitors = competitorsEnricher(profile, digital, context);
  const opportunities = opportunitiesEnricher(context, weaknesses);
  const risks = risksEnricher(context, decision);
  const recommendations = recommendationsEnricher({ profile, digital, context, weaknesses, opportunities, brand, estimates: decision ? decision.estimates : null });
  return {
    brand,
    competitors,
    strengths,
    weaknesses,
    opportunities,
    risks,
    recommendations,
    grades: {
      businessScore: context.scores && context.scores.business ? context.scores.business : 0,
      opportunity: context.scores && context.scores.opportunity ? context.scores.opportunity : 0,
      presence: context.scores && context.scores.presence != null ? context.scores.presence : digitalPresenceScore(digital),
      digitalPresence: digitalPresenceScore(digital),
      healthGrade: healthGrade(context, weaknesses),
      digitalGrade: digitalGrade(digital, context)
    }
  };
}

export function healthGrade(context, weaknesses) {
  const business = context.scores && context.scores.business ? context.scores.business : 0;
  const majors = weaknesses.filter((w) => w.severity === 'major').length;
  let base = business - majors * 12;
  if (base >= 70) return 'A';
  if (base >= 55) return 'B';
  if (base >= 35) return 'C';
  return 'D';
}

export function digitalGrade(digital, context) {
  const presence = context.presence || {};
  const seo = presence.seoPresent;
  const social = presence.socialActivity > 0;
  const booking = presence.hasBooking;
  const score = digitalPresenceScore(digital) + (seo ? 5 : 0) + (social ? 5 : 0) + (booking ? 5 : 0);
  if (score >= 70) return 'A';
  if (score >= 50) return 'B';
  if (score >= 30) return 'C';
  return 'D';
}
