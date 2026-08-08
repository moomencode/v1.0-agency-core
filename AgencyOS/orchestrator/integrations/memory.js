export class MemoryAdapter {
  constructor({ memory = null } = {}) {
    this.memory = memory;
  }

  putBusinessExecution({ businessId, executionId, summary }) {
    if (!this.memory) return null;
    return this.memory.put(
      'business',
      `business:${businessId}`,
      `orchestrator:execution:${executionId}`,
      summary,
      { tags: ['orchestrator', 'execution'] }
    );
  }

  putBusinessCampaign({ businessId, campaignId, summary }) {
    if (!this.memory) return null;
    return this.memory.put(
      'business',
      `business:${businessId}`,
      `orchestrator:campaign:${campaignId}`,
      summary,
      { tags: ['orchestrator', 'campaign'] }
    );
  }
}
