export class BrainAdapter {
  constructor({ brain = null, budget = null } = {}) {
    this.brain = brain;
    this.budget = budget || null;
  }

  async evaluate(record) {
    if (!this.brain) throw new Error('brain adapter requires a Brain instance');
    const result = await this.brain.runBusiness(record, { emit: false });
    if (this.budget) this.budget.tryConsume('aiCalls', 1);
    return result;
  }

  summarize(result) {
    return this.brain.summarize(result);
  }
}
