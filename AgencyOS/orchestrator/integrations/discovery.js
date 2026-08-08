export class DiscoveryAdapter {
  constructor({ discovery = null, budget = null } = {}) {
    this.discovery = discovery;
    this.budget = budget || null;
  }

  async runCampaignDiscovery(campaign) {
    if (!this.discovery) throw new Error('discovery adapter requires a DiscoverySystem');
    const spec = campaign.discovery || {};
    const query = spec.query || { all: true, category: spec.category, area: spec.area, market: spec.market };
    const opts = {};
    if (spec.sources && Array.isArray(spec.sources) && spec.sources.length) opts.sources = spec.sources;
    if (spec.maxCandidates) opts.maxCandidates = spec.maxCandidates;
    if (spec.artifact === false) opts.artifact = false;
    const result = await this.discovery.run(query, opts);
    return result.businesses || [];
  }

  loadRecord(businessId) {
    return this.discovery.load(businessId);
  }

  assertBusiness(record) {
    if (!record || !record.id || !record.name) {
      throw new Error(`discovery record invalid for business "${record && record.id}"`);
    }
    return record;
  }
}
