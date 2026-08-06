import { Executor } from './executor.js';
import { readJson } from './utils.js';

const [, , command, ...args] = process.argv;

function usage() {
  console.log(`AgencyOS Runtime CLI
  node runtime/cli.mjs list
  node runtime/cli.mjs run <workflowId> [--input <file.json>] [--run-id <id>] [--fresh] [--seed <seed>] [--strict]
  node runtime/cli.mjs resume <runId>
  node runtime/cli.mjs stats`);
  process.exit(1);
}

async function main() {
  if (!command || command === '--help' || command === '-h') usage();
  const runtime = new Executor({});

  if (command === 'list') {
    const stats = runtime.stats();
    console.log(JSON.stringify({ workflows: stats.registry.workflows, agents: stats.registry.agents }, null, 2));
    return;
  }

  if (command === 'stats') {
    console.log(JSON.stringify(runtime.stats(), null, 2));
    return;
  }

  if (command === 'resume') {
    const runId = args[0];
    if (!runId) usage();
    const result = await runtime.resume(runId);
    console.log(JSON.stringify({ runId: result.runId, workflowId: result.workflowId, status: result.status, alreadyCompleted: result.alreadyCompleted || false, steps: result.steps?.length || 0, stages: result.stages?.length || 0, documents: Object.keys(result.documents || {}), metrics: result.metrics }, null, 2));
    return;
  }

  if (command === 'run') {
    const workflowId = args[0];
    if (!workflowId) usage();
    const options = { resume: true, strict: false };
    let input = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--input') input = readJson(args[++i], input);
      if (args[i] === '--run-id') options.runId = args[++i];
      if (args[i] === '--fresh') options.resume = false;
      if (args[i] === '--seed') options.seed = args[++i];
      if (args[i] === '--strict') options.strict = true;
    }
    const result = await runtime.run(workflowId, input, options);
    console.log(JSON.stringify({ runId: result.runId, workflowId: result.workflowId, status: result.status, steps: result.steps?.length || 0, stages: result.stages?.length || 0, documents: Object.keys(result.documents || {}), gates: result.summary?.gates || {}, metrics: result.metrics, error: result.error || null }, null, 2));
    if (result.status === 'failed') process.exitCode = 2;
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(JSON.stringify({ code: err.code, message: err.message, meta: err.meta || null }, null, 2));
  process.exit(1);
});
