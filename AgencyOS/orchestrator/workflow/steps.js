export const WORKFLOW_VERSION = 1;

function budgetError(message) {
  const err = new Error(message);
  err.code = 'E_ORC_LIMITS_REACHED';
  err.meta = { class: 'POLICY' };
  return err;
}

export const STEP_IDS = [
  'discover',
  'qualify',
  'evaluate',
  'build-dossier',
  'generate-config',
  'render-site',
  'run-qa',
  'package',
  'request-delivery',
  'deploy',
  'verify',
  'persist',
  'report'
];

export const RETRYABLE_STEPS = new Set([
  'discover',
  'build-dossier',
  'generate-config',
  'render-site',
  'run-qa',
  'deploy',
  'verify'
]);

export const ENTRY_STATE = {
  discover: 'CREATED',
  qualify: 'QUALIFYING',
  evaluate: 'EVALUATING',
  'build-dossier': 'APPROVED',
  'generate-config': 'CONFIG_GENERATING',
  'render-site': 'SITE_RENDERING',
  'run-qa': 'QA_RUNNING',
  package: 'READY_FOR_DELIVERY',
  'request-delivery': 'READY_FOR_DELIVERY',
  deploy: 'DEPLOYING',
  verify: 'VERIFYING',
  persist: 'VERIFYING',
  report: 'VERIFYING'
};

export const STEP_INDEX = Object.fromEntries(STEP_IDS.map((id, i) => [id, i]));

export const FINAL_OUTCOME_STATES = new Set(['DEPLOYED', 'ROLLED_BACK', 'REJECTED', 'FAILED', 'ARCHIVED']);

function instanceWrite(deps, execution, name, value) {
  return deps.fs.write(execution, name, value);
}

function instanceRead(deps, execution, name) {
  return deps.fs.read(execution, name);
}

export const STEPS = {
  discover: {
    id: 'discover',
    name: 'Discover business record',
    retryable: true,
    async run(execution, deps) {
      const record = deps.adapters.discovery.loadRecord(execution.businessId);
      deps.adapters.discovery.assertBusiness(record);
      execution.record = record;
      instanceWrite(deps, execution, 'record.json', record);
      return { event: 'DISCOVERED', outputs: { businessId: record.id, name: record.name } };
    }
  },

  qualify: {
    id: 'qualify',
    name: 'Qualify candidate against campaign filters',
    retryable: false,
    async run(execution, deps) {
      const record = instanceRead(deps, execution, 'record.json') || execution.record || deps.adapters.discovery.loadRecord(execution.businessId);
      const filters = (deps.campaign.filters || {}) || {};
      const opportunity = record.scores && record.scores.opportunity ? record.scores.opportunity.value : 0;
      const belowMin = typeof filters.minOpportunityScore === 'number' && opportunity < filters.minOpportunityScore;
      const hasWebsite = !!record.website;
      const weak = !hasWebsite || (record.probe && record.probe.ok === false) || (record.probe && record.probe.timeMs > 2500);
      const blocked = filters.requireNoWebsiteOrWeak === true && !weak;
      execution.outputs.qualification = {
        opportunity,
        tier: record.scores && record.scores.salesPriority ? record.scores.salesPriority.tier : null,
        weak,
        belowMin,
        blocked
      };
      if (belowMin || blocked) {
        execution.outcome = { verdict: 'FILTERED', reason: belowMin ? 'below-min-opportunity' : 'not-weak-website', opportunity };
        return { event: null, terminal: true, reason: execution.outcome.reason };
      }
      return { event: 'QUALIFIED', outputs: { qualification: execution.outputs.qualification } };
    }
  },

  evaluate: {
    id: 'evaluate',
    name: 'Brain evaluation (authoritative verdict)',
    retryable: false,
    async run(execution, deps) {
      const record = instanceRead(deps, execution, 'record.json') || execution.record || deps.adapters.discovery.loadRecord(execution.businessId);
      if (!deps.budget.tryConsume('aiCalls', 1)) throw budgetError('ai-call limit reached');
      const brainResult = await deps.adapters.brain.evaluate(record);
      execution.brainResult = brainResult;
      instanceWrite(deps, execution, 'decision.json', brainResult);
      const decision = brainResult.decision;
      execution.outputs.decisionId = decision.decisionId;
      execution.outputs.verdict = decision.verdict;
      execution.outputs.confidence = decision.confidence;
      execution.outputs.riskLevel = decision.risk ? decision.risk.level : null;

      const artifact = deps.adapters.artifacts.createWithDedupe({
        name: `execution-${execution.executionId}-decision-record`,
        type: 'decision-record',
        format: 'json',
        content: JSON.stringify(brainResult, null, 2),
        workflowId: execution.campaignId,
        runId: execution.executionId,
        stepId: 'evaluate',
        title: `Brain decision ${decision.verdict} — ${record.name}`,
        summary: `${record.category} — ${decision.verdict} (confidence ${decision.confidence}, risk ${decision.risk ? decision.risk.level : 'n/a'})`,
        tags: ['orchestrator', 'decision']
      });
      execution.outputs.artifactIds.push(artifact.id);

      const map = {
        APPROVE: 'DECIDED_APPROVE',
        REJECT: 'DECIDED_REJECT',
        ESCALATE: 'DECIDED_ESCALATE',
        PARK: 'DECIDED_PARK'
      };
      const event = map[decision.verdict] || 'DECIDED_PARK';
      if (decision.verdict === 'ESCALATE') {
        deps.approvals.request({
          executionId: execution.executionId,
          campaignId: execution.campaignId,
          kind: 'ESCALATE',
          step: 'evaluate',
          requestedBy: 'workflow',
          evidence: {
            decisionId: decision.decisionId,
            verdict: decision.verdict,
            riskLevel: decision.risk ? decision.risk.level : null,
            riskReason: decision.risk ? decision.risk.reason : null
          }
        });
        deps.trace.append({ step: 'evaluate', detail: 'escalation-approval-requested', verdict: decision.verdict, riskLevel: decision.risk ? decision.risk.level : null });
      }
      return { event, outputs: { decisionId: decision.decisionId, verdict: decision.verdict } };
    }
  },

  'build-dossier': {
    id: 'build-dossier',
    name: 'Build dossier (requireApproved gate)',
    retryable: true,
    async run(execution, deps) {
      const brainResult = instanceRead(deps, execution, 'decision.json') || execution.brainResult;
      if (!brainResult) throw new Error('brain result missing for dossier build');
      const inputFingerprint = deps.adapters.dossier.inputFingerprintOf(brainResult);
      if (execution.outputs.dossierVersion && execution.outputs.dossierInputFingerprint === inputFingerprint) {
        const existing = deps.adapters.dossier.latestVersion(execution.businessId);
        if (existing) {
          return { event: 'DOSSIER_START', outputs: { dossierVersion: existing, dossierInputFingerprint: inputFingerprint, reused: true } };
        }
      }
      const dossier = await deps.adapters.dossier.build({
        brainResult,
        requireApproved: brainResult.decision.verdict !== 'ESCALATE',
        persist: true
      });
      return { event: 'DOSSIER_START', outputs: { dossierVersion: dossier.version, dossierInputFingerprint: inputFingerprint, reused: false } };
    }
  },

  'generate-config': {
    id: 'generate-config',
    name: 'Generate website configuration bundle',
    retryable: true,
    async run(execution, deps) {
      const dossier = deps.adapters.dossier.load(execution.businessId, { version: execution.outputs.dossierVersion || null });
      const ctx = await deps.adapters.pipeline.run({ dossier, businessId: execution.businessId });
      execution.pipelineCtx = { configs: ctx.configs, manifest: ctx.manifest, structuredData: ctx.structuredData, checksums: ctx.checksums };
      instanceWrite(deps, execution, 'pipeline.json', execution.pipelineCtx);
      return { event: 'SITE_START', outputs: { pipelineRunId: ctx.runId, configCount: ctx.configCount || 0 } };
    }
  },

  'render-site': {
    id: 'render-site',
    name: 'Render site model',
    retryable: true,
    async run(execution, deps) {
      const pipeline = instanceRead(deps, execution, 'pipeline.json') || execution.pipelineCtx;
      if (!pipeline) throw new Error('pipeline context missing for site render');
      const site = deps.adapters.website.buildSite({
        configs: pipeline.configs,
        manifest: pipeline.manifest,
        structuredData: pipeline.structuredData
      });
      const validation = deps.adapters.website.validateSite(site);
      const engineChecksum = deps.adapters.website.engineOutputChecksumOf(site);
      execution.site = site;
      execution.outputs.validation = { passed: validation.passed, pages: validation.totals.pages, checks: validation.totals.checks, failed: validation.totals.failed };
      instanceWrite(deps, execution, 'site.json', { site, validation, engineChecksum });
      return { event: 'QA_START', outputs: { engineOutputChecksum: engineChecksum, validation: execution.outputs.validation } };
    }
  },

  'run-qa': {
    id: 'run-qa',
    name: 'Production build + final QA (secret scan included)',
    retryable: true,
    async run(execution, deps) {
      const { site, validation, engineChecksum } = instanceRead(deps, execution, 'site.json') || {};
      if (!site) throw new Error('site model missing for QA');
      const dossierVersion = execution.outputs.dossierVersion;
      const pipelineRunId = execution.outputs.pipelineRunId;
      const { buildId, record: buildRecord, reused } = await deps.adapters.delivery.buildProduction({
        businessId: execution.businessId,
        site,
        validation,
        dossierVersion,
        pipelineRunId,
        engineOutputChecksum: engineChecksum || execution.outputs.engineOutputChecksum
      });
      const files = deps.adapters.delivery.delivery.builds.readTree(buildId);
      const qaReport = deps.adapters.delivery.runFinalQa({ buildId, site, validation, buildRecord, files });
      const qaPassed = Boolean(qaReport.passed);
      execution.outputs.buildId = buildId;
      execution.outputs.qaReportId = buildId;
      execution.outputs.siteReused = reused;
      execution.outputs.qaSummary = {
        checks: qaReport.totals ? qaReport.totals.checks : 0,
        passed: qaReport.totals ? qaReport.totals.passed : 0,
        failed: qaReport.totals ? qaReport.totals.failed : 0
      };
      if (!qaPassed) {
        execution.outputs.qaFailedReport = { checks: qaReport.totals.checks, failed: qaReport.totals.failed };
        return { event: 'QA_FAILED', outputs: { qaPassed: false, qaFailedReport: execution.outputs.qaFailedReport } };
      }
      return { event: 'QA_PASSED', outputs: { buildId, qaPassed: true } };
    }
  },

  package: {
    id: 'package',
    name: 'Package production bundle',
    retryable: false,
    async run(execution, deps) {
      const buildId = execution.outputs.buildId;
      if (!buildId) throw new Error('buildId missing before packaging');
      const buildRecord = deps.adapters.delivery.delivery.builds.loadBuild(buildId);
      const qaReport = deps.adapters.delivery.loadQaReport(buildId);
      const tree = deps.adapters.delivery.delivery.builds.readTree(buildId);
      const { manifest } = deps.adapters.delivery.packageBuild({ buildId, buildRecord, qaReport, tree });
      execution.outputs.packageId = buildId;
      execution.outputs.bundleSha256 = manifest.bundle ? manifest.bundle.sha256 : null;
      return { event: null, outputs: { packageId: buildId, bundleSha256: execution.outputs.bundleSha256 } };
    }
  },

  'request-delivery': {
    id: 'request-delivery',
    name: 'Request delivery (autonomy-gated)',
    retryable: false,
    async run(execution, deps) {
      const campaign = deps.campaign;
      const resolution = deps.policy.resolve(campaign.autonomyLevel);
      const mode = deps.policy.deployModeFor(campaign.autonomyLevel);
      const provider = (campaign.deployment && campaign.deployment.provider) || 'local';
      const target = (campaign.deployment && campaign.deployment.target) || {};
      deps.policy.assertProviderAllowed(provider, campaign);
      const buildId = execution.outputs.buildId;
      if (!buildId) throw new Error('buildId missing before delivery request');
      if (mode === 'auto') {
        if (!deps.budget.markDeployment()) throw budgetError('deployment limit reached');
        if (!deps.budget.markProviderCall()) throw budgetError('provider-call limit reached');
      }
      const record = await deps.adapters.delivery.deliver({
        buildId,
        mode,
        provider,
        target,
        trace: {
          businessId: execution.businessId,
          dossierVersion: execution.outputs.dossierVersion,
          pipelineRunId: execution.outputs.pipelineRunId,
          engineOutputChecksum: execution.outputs.engineOutputChecksum,
          campaignId: campaign.id,
          executionId: execution.executionId,
          workflowVersion: WORKFLOW_VERSION
        }
      });
      execution.outputs.deliveryRecordId = record.id;
      execution.outputs.deliveryMode = mode;
      execution.outputs.deliveryStatus = record.status;
      deps.trace.append({ step: 'request-delivery', detail: 'delivery-record-created', deliveryRecordId: record.id, mode, status: record.status });
      deps.audit.append({ action: 'delivery_requested', executionId: execution.executionId, recordId: record.id, mode, provider });

      if (mode === 'auto') {
        const approval = deps.approvals.request({
          executionId: execution.executionId,
          campaignId: campaign.id,
          kind: 'DEPLOY',
          step: 'deploy',
          requestedBy: 'policy:L5',
          evidence: { decisionId: execution.outputs.decisionId, recordId: record.id, qaReportId: execution.outputs.qaReportId }
        });
        const decided = deps.approvals.decide(approval.id, {
          granted: true,
          decidedBy: 'policy:L5',
          reason: 'autonomy level L5 auto-approval within policy'
        });
        deps.trace.append({ step: 'request-delivery', detail: 'approval-auto-granted', approvalId: decided.id, kind: 'DEPLOY' });
        execution.outputs.artifactIds.push(deps.adapters.artifacts.createWithDedupe({
          name: `execution-${execution.executionId}-approval-${decided.id}`,
          type: 'approval-record',
          format: 'json',
          content: JSON.stringify(decided, null, 2),
          workflowId: campaign.id,
          runId: execution.executionId,
          stepId: 'request-delivery',
          title: `Approval ${decided.id} (${decided.kind})`,
          summary: `${decided.decision.granted ? 'granted' : 'denied'} by ${decided.decision.decidedBy}`,
          tags: ['orchestrator', 'approval']
        }).id);
        deps.events.emit(deps.events.ORC_EVENTS.APPROVED, { approvalId: decided.id, executionId: execution.executionId, granted: true, decidedBy: 'policy:L5' });
        return { event: 'DELIVERY_REQUESTED', waiting: false, outputs: { deliveryRecordId: record.id, deliveryMode: mode } };
      }

      if (mode === 'dry-run') {
        const approval = deps.approvals.request({
          executionId: execution.executionId,
          campaignId: campaign.id,
          kind: 'DEPLOY',
          step: 'deploy',
          requestedBy: 'system',
          evidence: { decisionId: execution.outputs.decisionId, recordId: record.id, qaReportId: execution.outputs.qaReportId }
        });
        const decided = deps.approvals.decide(approval.id, {
          granted: true,
          decidedBy: 'system:dry-run-mode',
          reason: 'dry-run simulation only — no real deployment'
        });
        deps.trace.append({ step: 'request-delivery', detail: 'dry-run-recorded', approvalId: decided.id });
        return { event: 'DELIVERY_REQUESTED', waiting: false, outputs: { deliveryRecordId: record.id, deliveryMode: mode } };
      }

      const approval = deps.approvals.request({
        executionId: execution.executionId,
        campaignId: campaign.id,
        kind: 'DEPLOY',
        step: 'deploy',
        requestedBy: 'workflow',
        evidence: { decisionId: execution.outputs.decisionId, recordId: record.id, qaReportId: execution.outputs.qaReportId }
      });
      deps.trace.append({ step: 'request-delivery', detail: 'approval-required', approvalId: approval.id, kind: 'DEPLOY' });
      deps.events.emit(deps.events.ORC_EVENTS.APPROVAL_REQUIRED, { approvalId: approval.id, executionId: execution.executionId, kind: 'DEPLOY' });
      deps.audit.append({ action: 'approval_requested', approvalId: approval.id, executionId: execution.executionId, kind: 'DEPLOY' });
      return { event: 'DELIVERY_REQUESTED', waiting: true, approvalId: approval.id, outputs: { deliveryRecordId: record.id, deliveryMode: mode } };
    }
  },

  deploy: {
    id: 'deploy',
    name: 'Execute deployment through delivery',
    retryable: true,
    async run(execution, deps) {
      const recordId = execution.outputs.deliveryRecordId;
      if (!recordId) throw new Error('delivery record missing before deploy');
      const record = deps.adapters.delivery.getRecord(recordId);
      const mode = execution.outputs.deliveryMode;
      if (mode === 'explicit' && record.status === 'awaiting_approval') {
        const approval = deps.approvals.byExecution(execution.executionId).find((a) => a.kind === 'DEPLOY' && a.decision && a.decision.granted);
        if (!approval) {
          throw new Error(`DEPLOY approval not decided for execution "${execution.executionId}"`);
        }
        if (!deps.budget.markDeployment()) throw budgetError('deployment limit reached');
        if (!deps.budget.markProviderCall()) throw budgetError('provider-call limit reached');
        const deployed = await deps.adapters.delivery.approve(recordId, { by: approval.decision.decidedBy });
        execution.outputs.deliveryStatus = deployed.status;
      } else if (mode === 'auto') {
        const refreshed = deps.adapters.delivery.getRecord(recordId);
        execution.outputs.deliveryStatus = refreshed.status;
      } else if (mode === 'dry-run') {
        const refreshed = deps.adapters.delivery.getRecord(recordId);
        execution.outputs.deliveryStatus = refreshed.status;
      }
      return { event: 'DEPLOYED', outputs: { deliveryStatus: execution.outputs.deliveryStatus } };
    }
  },

  verify: {
    id: 'verify',
    name: 'Verify deployment outcome',
    retryable: true,
    async run(execution, deps) {
      const record = deps.adapters.delivery.getRecord(execution.outputs.deliveryRecordId);
      const status = record.status;
      execution.outputs.deliveryStatus = status;
      if (['failed', 'rejected'].includes(status)) {
        throw new Error(`delivery record "${record.id}" ended in state ${status}`);
      }
      if (!['recorded', 'simulated', 'deployed', 'rolled_back', 'reverted'].includes(status)) {
        throw new Error(`delivery record "${record.id}" not verified (state ${status})`);
      }
      return { event: null, outputs: { deliveryStatus: status, url: record.deployment ? record.deployment.url : null } };
    }
  },

  persist: {
    id: 'persist',
    name: 'Persist memory facts and artifacts',
    retryable: false,
    async run(execution, deps) {
      const summary = {
        executionId: execution.executionId,
        campaignId: execution.campaignId,
        verdict: execution.outputs.verdict || null,
        status: execution.status === 'VERIFYING' ? 'DEPLOYED' : execution.status,
        dossierVersion: execution.outputs.dossierVersion || null,
        pipelineRunId: execution.outputs.pipelineRunId || null,
        buildId: execution.outputs.buildId || null,
        deliveryRecordId: execution.outputs.deliveryRecordId || null,
        decisionId: execution.outputs.decisionId || null,
        outcome: execution.outcome || null
      };
      deps.adapters.memory.putBusinessExecution({
        businessId: execution.businessId,
        executionId: execution.executionId,
        summary
      });
      deps.adapters.memory.putBusinessCampaign({
        businessId: execution.businessId,
        campaignId: execution.campaignId,
        summary: { campaignId: execution.campaignId, executionId: execution.executionId, verdict: execution.outputs.verdict || null, deployed: execution.status === 'DEPLOYED' }
      });
      return { event: null, outputs: { persisted: true } };
    }
  },

  report: {
    id: 'report',
    name: 'Write execution report and trace artifact',
    retryable: false,
    async run(execution, deps) {
      const outcome = execution.outcome || { verdict: execution.outputs.verdict || null, status: execution.status };
      const report = {
        schema: 'https://agency.os/orchestrator/execution-report',
        executionId: execution.executionId,
        campaignId: execution.campaignId,
        businessId: execution.businessId,
        workflowVersion: WORKFLOW_VERSION,
        status: execution.status,
        outcome,
        outputs: { ...execution.outputs },
        error: execution.error || null,
        timeline: execution.timeline,
        approvals: deps.approvals.evidenceFor(execution.executionId),
        generatedAt: new Date().toISOString()
      };
      execution.outputs.reportFile = deps.trace.writeReport(report);
      const trace = deps.trace.writeAssembled({ outcome, outputs: execution.outputs });
      execution.outputs.artifactIds.push(
        deps.adapters.artifacts.createWithDedupe({
          name: `execution-${execution.executionId}-report`,
          type: 'execution-report',
          format: 'json',
          content: JSON.stringify(report, null, 2),
          workflowId: execution.campaignId,
          runId: execution.executionId,
          stepId: 'report',
          title: `Execution report — ${execution.businessId}`,
          summary: `${execution.status} (${outcome.verdict || 'n/a'})`,
          tags: ['orchestrator', 'report']
        }).id
      );
      execution.outputs.artifactIds.push(
        deps.adapters.artifacts.createWithDedupe({
          name: `execution-${execution.executionId}-trace`,
          type: 'execution-trace',
          format: 'json',
          content: JSON.stringify(trace, null, 2),
          workflowId: execution.campaignId,
          runId: execution.executionId,
          stepId: 'report',
          title: `Execution trace — ${execution.businessId}`,
          summary: `${trace.events.length} trace events`,
          tags: ['orchestrator', 'trace']
        }).id
      );
      return { event: 'VERIFIED', outputs: { reportFile: execution.outputs.reportFile } };
    }
  }
};

export function stepFor(stepIndex) {
  const id = STEP_IDS[stepIndex];
  return id ? STEPS[id] : null;
}

export function entryStateFor(stepIndex) {
  const id = STEP_IDS[stepIndex];
  return id ? ENTRY_STATE[id] : null;
}
