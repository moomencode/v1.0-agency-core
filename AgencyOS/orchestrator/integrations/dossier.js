import { fingerprint } from '../utils.js';

export class DossierAdapter {
  constructor({ dossier = null } = {}) {
    this.dossier = dossier;
  }

  inputFingerprintOf(brainResult) {
    return fingerprint({
      record: brainResult.record || null,
      context: brainResult.context || null,
      decision: brainResult.decision || null
    });
  }

  latestVersion(businessId) {
    return this.dossier.latestVersion(businessId);
  }

  load(businessId, opts = {}) {
    return this.dossier.load(businessId, opts);
  }

  async build({ brainResult, requireApproved = true, persist = true }) {
    if (!this.dossier) throw new Error('dossier adapter requires a DossierEngine');
    const dossier = await this.dossier.build(brainResult, {
      persist,
      update: false,
      requireApproved
    });
    return dossier;
  }
}
