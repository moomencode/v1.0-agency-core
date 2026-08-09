export class DeliveryAdapter {
  constructor({ delivery = null, budget = null } = {}) {
    this.delivery = delivery;
    this.budget = budget || null;
  }

  async buildProduction({ businessId, site, validation, dossierVersion, pipelineRunId, engineOutputChecksum }) {
    if (!this.delivery) throw new Error('delivery adapter requires a DeliverySystem');
    return this.delivery.builds.build(businessId, {
      site,
      validation,
      trace: { dossierVersion, pipelineRunId },
      engineOutputChecksum
    });
  }

  runFinalQa({ buildId, site, validation, buildRecord, files }) {
    return this.delivery.qa.run({ buildId, site, validation, buildRecord, files });
  }

  loadQaReport(buildId) {
    return this.delivery.qa.loadReport(buildId);
  }

  packageBuild({ buildId, buildRecord, qaReport, tree }) {
    return this.delivery.packaging.packageBuild({ buildId, buildRecord, qaReport, tree });
  }

  deliver({ buildId, mode, provider, target, trace, onProviderAttempt = null }) {
    return this.delivery.deliver({ buildId, mode, provider, target, trace, onProviderAttempt });
  }

  approve(recordId, opts = {}) {
    return this.delivery.approve(recordId, opts);
  }

  getRecord(recordId) {
    return this.delivery.getRecord(recordId);
  }

  history(businessId = null) {
    return this.delivery.history(businessId);
  }

  rollback(opts) {
    return this.delivery.rollback(opts);
  }

  approveRollback(recordId, opts = {}) {
    return this.delivery.approveRollback(recordId, opts);
  }

  revert(opts) {
    return this.delivery.revert(opts);
  }
}
