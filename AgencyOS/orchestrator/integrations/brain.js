export class BrainAdapter {
  constructor({ brain = null, budget = null } = {}) {
    this.brain = brain;
    this.budget = budget || null;
  }

  async evaluate(record) {
    if (!this.brain) throw new Error('brain adapter requires a Brain instance');
    const result = await this.brain.runBusiness(record, { emit: false });
    if (this.budget) this.budget.tryConsume('aiCalls', 1);
    // Preserve the original discovery record on the Brain result so downstream
    // integrations (e.g. dossier construction) build from the real business data
    // instead of falling back to an empty record / "Unknown Business". This is
    // additive only — Brain scoring, policy and decision semantics are unchanged
    // and the orchestrator does not re-score anything.
    result.record = record;
    return result;
  }

  summarize(result) {
    return this.brain.summarize(result);
  }
}
