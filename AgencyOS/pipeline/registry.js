import { pipError, PIP_CODES } from './errors.js';

export class PipelineRegistry {
  constructor({ apiVersion = '1.0' } = {}) {
    this.apiVersion = apiVersion;
    this.pipelines = new Map();
    this.generators = new Map();
    this.stages = new Map();
  }

  register(pipeline) {
    if (!pipeline || typeof pipeline.id !== 'string' || !pipeline.id) {
      throw pipError(PIP_CODES.INVALID_INPUT, 'pipeline requires an id');
    }
    if (pipeline.apiVersion && pipeline.apiVersion !== this.apiVersion) {
      throw pipError(PIP_CODES.VERSION_MISMATCH, `pipeline "${pipeline.id}" requires api ${pipeline.apiVersion}, registry has ${this.apiVersion}`, { pipeline: pipeline.id });
    }
    const stages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
    this._assertNoCycle(pipeline.id, stages);
    this.pipelines.set(pipeline.id, { ...pipeline, stages });
    for (const stage of stages) this.stages.set(stage.id, { pipeline: pipeline.id, stage });
    return this;
  }

  registerGenerator(gen) {
    if (!gen || typeof gen.id !== 'string') throw pipError(PIP_CODES.INVALID_INPUT, 'generator requires an id');
    if (gen.apiVersion && gen.apiVersion !== this.apiVersion) {
      throw pipError(PIP_CODES.VERSION_MISMATCH, `generator "${gen.id}" api ${gen.apiVersion} != ${this.apiVersion}`);
    }
    this.generators.set(gen.id, gen);
    return this;
  }

  get(id) {
    const p = this.pipelines.get(id);
    if (!p) throw pipError(PIP_CODES.UNKNOWN_PIPELINE, `unknown pipeline "${id}"`);
    return p;
  }

  discoverGenerators() {
    return [...this.generators.values()].map((g) => ({
      id: g.id,
      kind: g.kind || 'config',
      stage: g.stage || null,
      apiVersion: g.apiVersion || this.apiVersion
    }));
  }

  dependencyGraph(id) {
    const p = this.get(id);
    const graph = {};
    for (const stage of p.stages) {
      graph[stage.id] = (stage.dependsOn || []).filter((d) => this.stages.has(d));
    }
    return graph;
  }

  sortStages(id) {
    const p = this.get(id);
    const sorted = [];
    const visited = new Set();
    const visit = (sid) => {
      if (visited.has(sid)) return;
      visited.add(sid);
      for (const dep of p.stages.find((s) => s.id === sid)?.dependsOn || []) visit(dep);
      if (p.stages.some((s) => s.id === sid)) sorted.push(sid);
    };
    for (const s of p.stages) visit(s.id);
    return sorted;
  }

  _assertNoCycle(id, stages) {
    const idx = new Map(stages.map((s, i) => [s.id, i]));
    const visited = new Set();
    const stack = new Set();
    const walk = (sid) => {
      if (stack.has(sid)) throw pipError(PIP_CODES.DEPENDENCY_CYCLE, `dependency cycle in pipeline "${id}" at stage "${sid}"`);
      if (visited.has(sid)) return;
      stack.add(sid);
      const s = stages[idx.get(sid)];
      for (const d of s?.dependsOn || []) {
        if (idx.has(d)) walk(d);
        else if (this.stages.has(d)) walk(d);
      }
      stack.delete(sid);
      visited.add(sid);
    };
    for (const s of stages) walk(s.id);
  }
}

export const DEFAULT_PIPELINE = {
  id: 'website-production',
  apiVersion: '1.0',
  description: 'Transform a validated Business Dossier into a production-ready website config bundle.',
  stages: [
    { id: 'validate', label: 'Validate Dossier', run: 'validate' },
    { id: 'normalize', label: 'Normalize', run: 'normalize', dependsOn: ['validate'] },
    { id: 'generate-theme', label: 'Generate Theme', run: 'generate-theme', dependsOn: ['normalize'] },
    { id: 'generate-sections', label: 'Generate Sections', run: 'generate-sections', dependsOn: ['normalize'] },
    { id: 'generate-assets-manifest', label: 'Generate Assets Manifest', run: 'generate-assets-manifest', dependsOn: ['normalize'] },
    { id: 'generate-config', label: 'Generate Config', run: 'generate-config', dependsOn: ['normalize', 'generate-theme', 'generate-sections', 'generate-assets-manifest'] },
    { id: 'generate-navigation', label: 'Generate Navigation', run: 'generate-navigation', dependsOn: ['generate-sections'] },
    { id: 'generate-seo', label: 'Generate SEO', run: 'generate-seo', dependsOn: ['generate-config'] },
    { id: 'generate-structured-data', label: 'Generate Structured Data', run: 'generate-structured-data', dependsOn: ['generate-config', 'generate-seo'] },
    { id: 'generate-localization', label: 'Generate Localization', run: 'generate-localization', dependsOn: ['generate-config'] },
    { id: 'generate-build-package', label: 'Generate Build Package', run: 'generate-build-package', dependsOn: ['generate-navigation', 'generate-seo', 'generate-localization', 'generate-structured-data', 'generate-assets-manifest'] },
    { id: 'qa-validation', label: 'QA Validation', run: 'qa-validation', dependsOn: ['generate-build-package'] },
    { id: 'website-ready', label: 'Website Ready', run: 'website-ready', dependsOn: ['qa-validation'] }
  ]
};

export function createRegistry(opts = {}) {
  const reg = new PipelineRegistry(opts);
  reg.register(DEFAULT_PIPELINE);
  return reg;
}
