import { fingerprint } from '../utils.js';

export class WebsiteAdapter {
  constructor({ website = null } = {}) {
    this.website = website;
  }

  buildSite({ configs, manifest, structuredData }) {
    if (!this.website) throw new Error('website adapter requires a WebsiteEngine');
    return this.website.build(configs, { manifest, structuredData });
  }

  validateSite(site) {
    return this.website.validate(site);
  }

  engineOutputChecksumOf(site) {
    return fingerprint(site);
  }

  exportFiles(site, { validation = null } = {}) {
    return this.website.export(site, { format: 'static', validation });
  }
}
