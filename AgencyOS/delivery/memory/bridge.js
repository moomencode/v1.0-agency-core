import { redact } from '../security/redaction.js';

export class DeliveryMemory {
  constructor({ memory = null, vault = null, logger = null } = {}) {
    this.memory = memory;
    this.vault = vault;
    this.logger = logger;
  }

  record(record) {
    if (!this.memory) return null;
    const safe = redact(record, { vault: this.vault });
    try {
      return this.memory.put(
        'business',
        `business:${record.businessId}`,
        `deployment:${record.id}`,
        {
          recordId: record.id,
          businessId: record.businessId,
          mode: record.mode,
          status: record.status,
          provider: record.provider,
          packageId: record.package?.packageId || null,
          bundleSha256: record.package?.bundleSha256 || null,
          url: record.deployment?.url || null,
          deploymentId: record.deployment?.id || null,
          rollbackOf: record.rollbackOf || null,
          at: record.timeline?.at || record.createdAt
        },
        {}
      );
    } catch (err) {
      this.logger?.warn?.(`delivery memory write failed: ${err.message}`);
      return null;
    }
  }
}
