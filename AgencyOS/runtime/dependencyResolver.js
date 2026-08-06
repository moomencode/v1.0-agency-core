import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, slugify } from './utils.js';
import { typedError, CODES } from './errors.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export class DependencyResolver {
  constructor({ root = ROOT, validator = null, logger = null } = {}) {
    this.root = root;
    this.validator = validator;
    this.logger = logger;
    this.workflowsDir = path.join(root, 'workflows');
    this.agentsDir = path.join(root, 'agents');
    this.schemasDir = path.join(root, 'schemas');
    this.sharedDir = path.join(root, 'shared');
    this.agentCache = new Map();
    this.workflowCache = new Map();
  }

  _loadJson(file, fallback = null) {
    return readJson(file, fallback);
  }

  loadAgent(agentId) {
    const key = String(agentId).toLowerCase();
    if (this.agentCache.has(key)) return this.agentCache.get(key);
    const folder = this._findAgentFolder(agentId);
    if (!folder) return null;
    const config = this._loadJson(path.join(folder, 'config.json'), null);
    if (!config) throw typedError(CODES.INFRA_STORAGE, `agent config missing/invalid: ${agentId}`, { agentId });
    const inputSchema = this._loadJson(path.join(folder, 'input.schema.json'), null);
    const outputSchema = this._loadJson(path.join(folder, 'output.schema.json'), null);
    const implFile = this._findImplFile(folder);
    const agent = {
      id: config.id,
      name: config.name || folderName(folder),
      folder: folderName(folder),
      folderPath: folder,
      config,
      inputSchema,
      outputSchema,
      inputSchemaPath: path.join(folder, 'input.schema.json'),
      outputSchemaPath: path.join(folder, 'output.schema.json'),
      promptPath: path.join(folder, 'prompt.md'),
      implFile,
      sharedDeps: (config.dependencies && config.dependencies.shared) || [],
      tools: config.tools || [],
      aliases: this._aliasesFor(config, folder)
    };
    this.agentCache.set(key, agent);
    for (const alias of agent.aliases) this.agentCache.set(alias.toLowerCase(), agent);
    return agent;
  }

  _findAgentFolder(agentId) {
    const id = String(agentId);
    const direct = path.join(this.agentsDir, id);
    if (fs.existsSync(path.join(direct, 'config.json'))) return direct;
    if (!fs.existsSync(this.agentsDir)) return null;
    for (const folder of fs.readdirSync(this.agentsDir)) {
      const folderPath = path.join(this.agentsDir, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;
      const config = this._loadJson(path.join(folderPath, 'config.json'), null);
      if (!config) continue;
      if (config.id === id) return folderPath;
      const normalized = slugify(config.name || '');
      if (slugify(folder) === slugify(id) || normalized === slugify(id)) return folderPath;
    }
    return null;
  }

  _findImplFile(folder) {
    for (const candidate of ['index.mjs', 'index.js']) {
      const file = path.join(folder, 'impl', candidate);
      if (fs.existsSync(file)) return file;
    }
    return null;
  }

  _aliasesFor(config, folder) {
    const aliases = new Set([config.id, folderName(folder), config.name]);
    aliases.add(slugify(config.id));
    aliases.add(slugify(config.name || ''));
    return [...aliases].filter(Boolean);
  }

  loadWorkflow(workflowId) {
    const key = String(workflowId).toLowerCase();
    if (this.workflowCache.has(key)) return this.workflowCache.get(key);
    const folderPath = path.join(this.workflowsDir, workflowId);
    const defFile = path.join(folderPath, 'definition.json');
    const schemaFile = path.join(folderPath, 'workflow.json');
    let definition = null;
    if (fs.existsSync(defFile)) {
      definition = this._loadJson(defFile, null);
    } else {
      const fallback = this._loadJson(schemaFile, null);
      if (fallback && (Array.isArray(fallback.steps) || Array.isArray(fallback.stages))) definition = fallback;
    }
    if (!definition) {
      this.workflowCache.set(key, null);
      return null;
    }
    if (this.validator && fs.existsSync(schemaFile)) {
      const schema = this._loadJson(schemaFile, null);
      if (schema && typeof schema === 'object' && schema.type) {
        const result = this.validator.validate(definition, schema, { schemaPath: schemaFile });
        if (!result.valid) {
          throw typedError(CODES.VALIDATION_SCHEMA, `workflow definition "${workflowId}" failed its own contract schema`, {
            workflowId,
            schemaPath: schemaFile,
            errors: result.errors.slice(0, 10)
          });
        }
      }
    }
    const workflow = {
      id: definition.id || workflowId,
      name: definition.name || workflowId,
      def: definition,
      folder: workflowId,
      folderPath,
      definitionFile: defFile,
      schemaFile,
      steps: definition.steps || null,
      stages: definition.stages || null,
      actors: (definition.actors || []).map((a) => String(a).toLowerCase()),
      entryDocument: definition.entryDocument ? slugify(definition.entryDocument) : null,
      exitDocument: definition.exitDocument ? slugify(definition.exitDocument) : null,
      checks: definition.checks || null,
      reworkLoops: definition.reworkLoops || null,
      exitConditions: definition.exitConditions || null
    };
    this.workflowCache.set(key, workflow);
    return workflow;
  }

  plan(workflow) {
    if (workflow.stages) {
      return workflow.stages
        .map((s) => ({ ...s, type: 'stage' }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return (workflow.steps || []).map((s, i) => ({ ...s, type: 'step', index: i }));
  }

  stepInputName(workflow, item, index) {
    if (index === 0) {
      return workflow.entryDocument || null;
    }
    const prev = workflow.steps[index - 1];
    return prev ? slugify(prev.output) : null;
  }

  resolveSharedStatus(agent) {
    const modules = {};
    for (const mod of agent.sharedDeps) {
      const file = path.join(this.sharedDir, `${mod.toUpperCase()}.md`);
      modules[mod] = fs.existsSync(file) ? 'available' : 'missing';
    }
    return modules;
  }

  resolveTools(agent) {
    const known = new Set(['storage-client', 'logging-client', 'crm-client', 'engine-cli']);
    return Object.fromEntries(agent.tools.map((t) => [t, known.has(t) ? 'available' : 'external']));
  }

  resolveAgentCapabilities(agent) {
    return {
      shared: this.resolveSharedStatus(agent),
      tools: this.resolveTools(agent)
    };
  }

  listWorkflowIds() {
    if (!fs.existsSync(this.workflowsDir)) return [];
    return fs
      .readdirSync(this.workflowsDir)
      .filter((d) => fs.statSync(path.join(this.workflowsDir, d)).isDirectory())
      .filter((d) => {
        const def = path.join(this.workflowsDir, d, 'definition.json');
        const schema = path.join(this.workflowsDir, d, 'workflow.json');
        return fs.existsSync(def) || fs.existsSync(schema);
      });
  }

  listAgentIds() {
    if (!fs.existsSync(this.agentsDir)) return [];
    return fs
      .readdirSync(this.agentsDir)
      .filter((d) => {
        const dir = path.join(this.agentsDir, d);
        return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'config.json'));
      });
  }
}

function folderName(folderPath) {
  return path.basename(folderPath);
}

export function createDependencyResolver(opts) {
  return new DependencyResolver(opts);
}
