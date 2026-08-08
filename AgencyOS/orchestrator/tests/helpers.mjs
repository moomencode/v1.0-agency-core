import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiscoverySystem } from '../../discovery/index.js';
import { createBrain } from '../../brain/index.js';
import { createDossierEngine } from '../../dossier/index.js';
import { createPipelineRunner } from '../../pipeline/runner.js';
import { createWebsiteEngine } from '../../website-engine/index.js';
import { createDeliverySystem } from '../../delivery/index.js';
import { createArtifactSystem } from '../../artifacts/index.js';
import { createMemorySystem } from '../../memory/index.js';
import { createOrchestratorSystem } from '../index.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function scratchRoot(name) {
  const root = path.join(ROOT, 'storage', 'orchestrator-tests', name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export const SIMULATED_ROWS = [
  {
    id: 'demo-cairo-001',
    name: 'Cairo Roast Coffee',
    category: 'cafe',
    area: 'Cairo',
    address: '12 Tahrir Square, Cairo',
    phone: '+20-100-000-0001',
    whatsapp: '+20-100-000-0001',
    email: 'hello@cairoroast.example',
    rating: 4.4,
    reviews: 200,
    instagram: 'https://instagram.com/cairoroast',
    facebook: 'https://facebook.com/cairoroast',
    photos: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg'],
    menus: ['/menu.pdf', '/menu2.pdf'],
    booking: 'https://booking.example/cairoroast',
    openingHours: ['Sat-Thu 08:00-22:00'],
    collectedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'demo-cairo-002',
    name: 'Nile Bites Grill',
    category: 'restaurant',
    area: 'Cairo',
    address: '45 Nile Corniche, Zamalek',
    phone: '+20-100-000-0002',
    whatsapp: '+20-100-000-0002',
    email: 'hello@nilebites.example',
    rating: 4.1,
    reviews: 60,
    instagram: 'https://instagram.com/nilebites',
    photos: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg', 'p6.jpg'],
    menus: ['/menu.pdf', '/menu2.pdf', '/menu3.pdf'],
    booking: 'https://booking.example/nilebites',
    openingHours: ['Sat-Thu 12:00-00:00'],
    collectedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'demo-cairo-003',
    name: 'Khan El-Khalili Sweets',
    category: 'dessert',
    area: 'Cairo',
    address: '7 Khan El-Khalili Bazaar',
    phone: '+20-100-000-0003',
    whatsapp: '+20-100-000-0003',
    rating: 3.9,
    reviews: 15,
    facebook: 'https://facebook.com/khan-sweets',
    photos: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg'],
    menus: ['/menu.pdf'],
    collectedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'demo-cairo-004',
    name: 'Old Cairo Antiques',
    category: 'other',
    area: 'Cairo',
    address: '3 Al-Muizz Street',
    phone: '+20-100-000-0004',
    whatsapp: '+20-100-000-0004',
    email: 'sales@oldcairoantiques.example',
    rating: 4.2,
    reviews: 80,
    website: 'https://oldcairoantiques.example',
    instagram: 'https://instagram.com/oldcairoantiques',
    facebook: 'https://facebook.com/oldcairoantiques',
    premiumWebsite: true,
    probe: {
      ok: true,
      status: 200,
      timeMs: 800,
      isHttps: true,
      title: 'Old Cairo Antiques',
      metaDescription: 'Antiques from Old Cairo',
      hasH1: true,
      hasViewport: true,
      hasLang: 'en'
    },
    photos: ['p1.jpg', 'p2.jpg', 'p3.jpg'],
    openingHours: ['Sat-Thu 10:00-20:00'],
    collectedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'demo-cairo-005',
    name: 'Zamalek Fashion Co',
    category: 'other',
    area: 'Cairo',
    address: '90 26th of July Street',
    phone: '+20-100-000-0005',
    whatsapp: '+20-100-000-0005',
    email: 'info@zamalekfashion.example',
    rating: 3.4,
    reviews: 12,
    website: 'https://zamalekfashion.example',
    probe: {
      ok: true,
      status: 200,
      timeMs: 700,
      isHttps: true,
      title: 'Zamalek Fashion Co',
      metaDescription: 'Fashion from Zamalek',
      hasH1: true,
      hasViewport: true,
      hasLang: 'en'
    },
    duplicate: true,
    photos: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg'],
    openingHours: ['Sat-Thu 10:00-23:00'],
    collectedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'demo-cairo-006',
    name: 'Corniche Electronics',
    category: 'other',
    area: 'Cairo',
    address: '5 Corniche El Nil',
    phone: '+20-100-000-0006',
    email: 'support@corniche-electronics.example',
    rating: 4.0,
    reviews: 90,
    collectedAt: '2026-01-01T00:00:00.000Z'
  }
];

export function simulatedSource(rows = SIMULATED_ROWS) {
  return {
    id: 'simulated',
    name: 'Simulated market source',
    ready: true,
    async discover(query, { domains = null } = {}) {
      return rows;
    },
    async normalize(row) {
      return row;
    },
    validate() {
      return { valid: true, errors: [] };
    },
    async enrich(row) {
      return row;
    },
    score() {
      return null;
    }
  };
}

export function baseSpec(overrides = {}) {
  return {
    name: 'cairo-market-test',
    discovery: {
      market: 'Cairo',
      category: 'cafe',
      query: { area: 'Cairo', category: 'cafe' },
      sources: ['simulated']
    },
    filters: { minOpportunityScore: 40, requireNoWebsiteOrWeak: false },
    autonomyLevel: 'L4',
    deployment: { provider: 'local', target: { project: 'agency-test' }, allowedProviders: ['local'] },
    limits: {
      maxBusinesses: 6,
      maxConcurrent: 3,
      maxRetries: 2,
      maxAiCalls: 100,
      maxProviderCalls: 100,
      maxDeployments: 50,
      maxExecutionDurationMs: 120000,
      maxCampaignDurationMs: 600000
    },
    approvals: { requireDeploymentApproval: true, requireEscalationApproval: true },
    ...overrides
  };
}

export async function createStack(root, { rows = SIMULATED_ROWS, autoAllowed = false } = {}) {
  const artifacts = createArtifactSystem({ root, sweeperMs: 0 });
  const memory = createMemorySystem({ root, validate: true });
  const discovery = createDiscoverySystem({
    root,
    sources: { simulated: simulatedSource(rows) },
    probeMode: 'offline',
    probeWebsites: false,
    validator: true
  });
  const brain = createBrain({});
  const dossier = createDossierEngine({ root, memory, brain });
  const website = createWebsiteEngine({});
  const pipeline = createPipelineRunner({ root });
  const delivery = createDeliverySystem({
    root,
    engine: { export: (site, opts) => website.export(site, opts) },
    artifacts,
    memory,
    autoAllowed,
    retryConfig: { maxAttempts: 3, initialDelayMs: 20 }
  });
  return { discovery, brain, dossier, pipeline, website, delivery, artifacts, memory };
}

export function createSystem(root, stack, opts = {}) {
  return createOrchestratorSystem({
    root,
    discovery: stack.discovery,
    brain: stack.brain,
    dossier: stack.dossier,
    pipeline: stack.pipeline,
    website: stack.website,
    delivery: stack.delivery,
    memory: stack.memory,
    artifacts: stack.artifacts,
    ...opts
  });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

export async function runTests(name, fns) {
  let failed = 0;
  let passed = 0;
  for (const [label, fn] of Object.entries(fns)) {
    try {
      await fn();
      passed++;
      console.log(`  ok  ${label}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  ${label}`);
      console.error(`      ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n      ') : err}`);
    }
  }
  console.log(`\n${name}: ${passed} passed, ${failed} failed`);
  return failed === 0;
}
