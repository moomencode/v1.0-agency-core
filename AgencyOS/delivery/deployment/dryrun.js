export function buildDryRunReport({ record, packageInfo, provider, qaReport }) {
  const simulation = provider.dryRun(packageInfo);
  return {
    recordId: record.id,
    mode: 'dry-run',
    would: {
      provider: provider.id,
      project: simulation.project || provider.config?.project || null,
      packageId: packageInfo.packageId,
      deploymentId: simulation.deploymentId,
      url: simulation.url,
      files: packageInfo.manifest?.bundle?.fileCount || null,
      bundleSha256: packageInfo.manifest?.bundle?.sha256 || null
    },
    gates: {
      qa: qaReport ? qaReport.passed : false,
      secrets: qaReport ? (qaReport.groups.find((g) => g.id === 'secrets')?.passed ?? false) : false,
      schema: true,
      approval: 'not required (dry-run)'
    },
    simulated: true,
    networkTouched: false,
    simulatedAtNote: 'deterministic simulation — no provider call performed'
  };
}
