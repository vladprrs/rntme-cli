export function dokployResourceName(
  orgSlug: string,
  projectSlug: string,
  workloadSlug: string,
): string {
  return ['rntme', orgSlug, projectSlug, workloadSlug].map(normalizePart).join('-');
}

export function dokployLabels(
  orgSlug: string,
  projectSlug: string,
  environment: string,
  workloadSlug: string,
): Record<string, string> {
  return {
    'rntme.org': orgSlug,
    'rntme.project': projectSlug,
    'rntme.environment': environment,
    'rntme.workload': workloadSlug,
    'rntme.managed-by': 'rntme-deploy-dokploy',
  };
}

function normalizePart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length === 0 ? 'unknown' : normalized;
}
