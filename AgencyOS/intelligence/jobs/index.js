import { funnelJob } from './funnel.js';
import { reliabilityJob } from './reliability.js';
import { durationsJob } from './durations.js';
import { providersJob } from './providers.js';
import { budgetJob } from './budget.js';
import { schedulerStatsJob } from './scheduler-stats.js';
import { incidentsJob } from './incidents.js';
import { alertsJob } from './alerts.js';
import { retentionJob } from './retention.js';

// Full job set. Order matters: analysis jobs first (they produce the metrics
// and insights the incident and alert jobs consume), incidents second, alert
// evaluation last, retention sweep last (it only touches expired windows).
export function buildJobSet(ctx) {
  return [
    funnelJob(ctx),
    reliabilityJob(ctx),
    durationsJob(ctx),
    providersJob(ctx),
    budgetJob(ctx),
    schedulerStatsJob(ctx),
    incidentsJob(ctx),
    alertsJob(ctx),
    retentionJob(ctx)
  ];
}

export { funnelJob, reliabilityJob, durationsJob, providersJob, budgetJob, schedulerStatsJob, incidentsJob, alertsJob, retentionJob };
