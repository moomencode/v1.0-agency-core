import { memError, MEM_CODES } from './errors.js';

export const MEMORY_TYPES = {
  working: {
    label: 'Working Memory',
    description: 'Ephemeral scratch for the active run/task; auto-cleared.',
    defaultScope: 'run:<runId>',
    scopePrefixes: ['run:'],
    ttlMs: 30 * 60 * 1000,
    persistent: false,
    indexable: false
  },
  project: {
    label: 'Project Memory',
    description: 'Persistent knowledge about an engagement/project shared across all workflows of that project.',
    defaultScope: 'project:<id>',
    scopePrefixes: ['project:'],
    ttlMs: 0,
    persistent: true,
    indexable: true
  },
  business: {
    label: 'Business Memory',
    description: 'Everything learned about a business: facts, corrections, preferences.',
    defaultScope: 'business:<id>',
    scopePrefixes: ['business:'],
    ttlMs: 0,
    persistent: true,
    indexable: true
  },
  brand: {
    label: 'Brand Memory',
    description: 'Brand identity and guidelines; global by default, overridable per brand.',
    defaultScope: 'global',
    scopePrefixes: ['global', 'brand:'],
    ttlMs: 0,
    persistent: true,
    indexable: true
  },
  customer: {
    label: 'Customer Memory',
    description: 'Per-customer knowledge: preferences, history, context.',
    defaultScope: 'customer:<id>',
    scopePrefixes: ['customer:'],
    ttlMs: 0,
    persistent: true,
    indexable: true
  },
  agent: {
    label: 'Agent Memory',
    description: 'Per-agent persistent state (strategies, corrections, learned rules).',
    defaultScope: 'agent:<id>',
    scopePrefixes: ['agent:'],
    ttlMs: 30 * 24 * 60 * 60 * 1000,
    persistent: true,
    indexable: true
  },
  workflow: {
    label: 'Workflow Memory',
    description: 'Per-workflow persistent state: gate history, decisions, partial progress.',
    defaultScope: 'workflow:<id>',
    scopePrefixes: ['workflow:'],
    ttlMs: 0,
    persistent: true,
    indexable: true
  },
  execution: {
    label: 'Execution Memory',
    description: 'Per-run execution records: summaries, errors, timings; append-only by design.',
    defaultScope: 'run:<id>',
    scopePrefixes: ['run:'],
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    persistent: true,
    indexable: true
  }
};

export const TYPE_NAMES = Object.keys(MEMORY_TYPES);

export function resolveScope(type, scope) {
  const def = MEMORY_TYPES[type];
  if (!def) throw memError(MEM_CODES.TYPE_UNKNOWN, `unknown memory type "${type}"`, { type });
  if (scope) {
    if (!def.scopePrefixes.some((p) => scope === p || scope.startsWith(p))) {
      throw memError(MEM_CODES.SCOPE_INVALID, `scope "${scope}" is not valid for memory type "${type}" (expected ${def.scopePrefixes.join(' or ')})`, {
        type,
        scope
      });
    }
    return scope;
  }
  return def.defaultScope;
}
