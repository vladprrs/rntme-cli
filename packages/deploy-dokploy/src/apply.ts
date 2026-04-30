import type { DokployApplication, DokployClient } from './client.js';
import type {
  DokployDeploymentError,
  DokployPartialFailure,
  DokployPartialFailureStep,
} from './errors.js';
import type { RenderedDokployPlan, RenderedDokployResource } from './render.js';
import { err, ok, type Result } from './result.js';

export type DeploymentApplyResource = {
  readonly logicalId: string;
  readonly workloadSlug: string;
  readonly kind: 'domain-service' | 'integration-module' | 'edge-gateway';
  readonly targetResourceId: string;
  readonly targetResourceName: string;
  readonly action: 'created' | 'updated' | 'unchanged';
};

export type DeploymentApplyResult = {
  readonly target: {
    readonly kind: 'dokploy';
    readonly environmentId: string;
  };
  readonly deployment: RenderedDokployPlan['deployment'];
  readonly resources: readonly DeploymentApplyResource[];
  readonly urls: RenderedDokployPlan['urls'];
  readonly renderedPlanDigest: string;
  readonly warnings: readonly string[];
  readonly verificationHints: {
    readonly healthUrl: string;
    readonly uiUrl?: string;
    readonly publicRouteUrls: readonly string[];
  };
};

export async function applyDokployPlan(
  rendered: RenderedDokployPlan,
  client: DokployClient,
): Promise<Result<DeploymentApplyResult, DokployDeploymentError>> {
  const applied: DeploymentApplyResource[] = [];

  try {
    const { environmentId } = await client.ensureEnvironment(rendered.targetProject, rendered.deployment.environment);

    for (const resource of rendered.resources) {
      const existingResult = await findExistingApplication(client, environmentId, resource, applied);
      if (!existingResult.ok) return existingResult;

      const existing = existingResult.value;
      if (existing === null) {
        const createResult = await createApplication(client, environmentId, resource, applied);
        if (!createResult.ok) return createResult;
        const lifecycleResult = await runApplicationLifecycle(client, createResult.value, resource, [
          ...applied,
          createResult.value,
        ]);
        if (!lifecycleResult.ok) return lifecycleResult;
        applied.push(createResult.value);
      } else if (resourceMatches(existing, resource)) {
        applied.push(appliedResource(resource, existing, 'unchanged'));
      } else {
        const updateResult = await updateApplication(client, existing.id, resource, applied);
        if (!updateResult.ok) return updateResult;
        const lifecycleResult = await runApplicationLifecycle(client, updateResult.value, resource, [
          ...applied,
          updateResult.value,
        ]);
        if (!lifecycleResult.ok) return lifecycleResult;
        applied.push(updateResult.value);
      }
    }

    return ok({
      target: { kind: 'dokploy', environmentId },
      deployment: rendered.deployment,
      resources: applied,
      urls: rendered.urls,
      renderedPlanDigest: rendered.digest,
      warnings: rendered.warnings,
      verificationHints: verificationHints(rendered),
    });
  } catch (cause) {
    return err([
      {
        code: 'DEPLOY_APPLY_DOKPLOY_API_ERROR',
        message: 'failed to initialize Dokploy project',
        cause: sanitizeCause(cause),
      },
    ]);
  }
}

async function findExistingApplication(
  client: DokployClient,
  environmentId: string,
  resource: RenderedDokployResource,
  applied: readonly DeploymentApplyResource[],
): Promise<Result<DokployApplication | null, DokployDeploymentError>> {
  try {
    return ok(await client.findApplicationByName(environmentId, resource.name));
  } catch (cause) {
    return partialFailure(cause, resource, applied, 'find');
  }
}

async function createApplication(
  client: DokployClient,
  environmentId: string,
  resource: RenderedDokployResource,
  applied: readonly DeploymentApplyResource[],
): Promise<Result<DeploymentApplyResource, DokployDeploymentError>> {
  try {
    const target = await client.createApplication(environmentId, resource);
    return ok(appliedResource(resource, target, 'created'));
  } catch (cause) {
    return partialFailure(cause, resource, applied, 'create');
  }
}

async function updateApplication(
  client: DokployClient,
  applicationId: string,
  resource: RenderedDokployResource,
  applied: readonly DeploymentApplyResource[],
): Promise<Result<DeploymentApplyResource, DokployDeploymentError>> {
  try {
    const target = await client.updateApplication(applicationId, resource);
    return ok(appliedResource(resource, target, 'updated'));
  } catch (cause) {
    return partialFailure(cause, resource, applied, 'update');
  }
}

async function runApplicationLifecycle(
  client: DokployClient,
  target: DeploymentApplyResource,
  resource: RenderedDokployResource,
  applied: readonly DeploymentApplyResource[],
): Promise<Result<void, DokployDeploymentError>> {
  try {
    await client.configureApplication(target.targetResourceId, resource);
  } catch (cause) {
    return partialFailure(cause, resource, applied, 'configure');
  }

  try {
    await client.deployApplication(target.targetResourceId);
  } catch (cause) {
    return partialFailure(cause, resource, applied, 'deploy');
  }

  return ok(undefined);
}

function appliedResource(
  resource: RenderedDokployResource,
  target: { readonly id: string; readonly name: string },
  action: DeploymentApplyResource['action'],
): DeploymentApplyResource {
  return {
    logicalId: resource.logicalId,
    workloadSlug: resource.workloadSlug,
    kind: resource.workloadKind,
    targetResourceId: target.id,
    targetResourceName: target.name,
    action,
  };
}

function partialFailure(
  cause: unknown,
  resource: RenderedDokployResource,
  applied: readonly DeploymentApplyResource[],
  action: DokployPartialFailureStep['action'],
): Result<never, DokployDeploymentError> {
  return err([
    {
      code: 'DEPLOY_APPLY_DOKPLOY_PARTIAL_FAILURE',
      message: `failed while applying resource "${resource.name}"`,
      resource: resource.name,
      cause: sanitizeCause(cause),
      partialFailure: buildPartialFailure(applied, {
        action,
        resourceName: resource.name,
        workloadSlug: resource.workloadSlug,
      }),
    },
  ]);
}

function buildPartialFailure(
  applied: readonly DeploymentApplyResource[],
  failedStep: DokployPartialFailureStep,
): DokployPartialFailure {
  return {
    createdResources: applied.filter((resource) => resource.action === 'created'),
    updatedResources: applied.filter((resource) => resource.action === 'updated'),
    failedStep,
    retrySafe: true,
  };
}

function resourceMatches(
  existing: {
    readonly image?: string;
    readonly build?: RenderedDokployResource['build'];
    readonly ports?: RenderedDokployResource['ports'];
    readonly ingress?: RenderedDokployResource['ingress'];
    readonly env?: RenderedDokployResource['env'];
    readonly labels?: RenderedDokployResource['labels'];
    readonly files?: RenderedDokployResource['files'];
  },
  resource: RenderedDokployResource,
): boolean {
  if (existing.image === undefined || existing.image !== resource.image) return false;
  if (!optionalComparableMatches(existing.build, resource.build)) return false;
  if (!optionalComparableMatches(existing.ports, resource.ports)) return false;
  if (!optionalComparableMatches(existing.ingress, resource.ingress)) return false;
  if (existing.env === undefined || !jsonEqual(existing.env, resource.env)) return false;
  if (existing.labels === undefined || !jsonEqual(sortRecord(existing.labels), sortRecord(resource.labels))) {
    return false;
  }

  if (resource.files === undefined) return existing.files === undefined;
  if (existing.files === undefined) return false;
  return jsonEqual(sortRecord(existing.files), sortRecord(resource.files));
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function optionalComparableMatches(existing: unknown, rendered: unknown): boolean {
  if (rendered === undefined) return existing === undefined;
  if (existing === undefined) return false;
  return jsonEqual(existing, rendered);
}

function sortRecord(value: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function verificationHints(rendered: RenderedDokployPlan): DeploymentApplyResult['verificationHints'] {
  const base = {
    healthUrl: joinUrl(rendered.urls.projectUrl, '/health'),
    publicRouteUrls: rendered.urls.publicRoutes.map((route) => route.url),
  };

  if (rendered.urls.uiUrl === undefined) return base;

  return {
    ...base,
    uiUrl: rendered.urls.uiUrl,
  };
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(path, normalizedBase).toString();
}

const REDACTED_CAUSE_VALUE = '[redacted]';
const CREDENTIAL_KEY_PATTERN =
  'api[-_]?token|apiToken|[a-z0-9_]*token|access_token|refresh_token|client_secret|password|secret';
const SECRET_VALUE_PATTERN = /dokploy-token-secret/g;
const BEARER_TOKEN_PATTERN = /\b(Bearer\s+)[^\s,;'"`]+/gi;
const QUERY_CREDENTIAL_PATTERN = new RegExp(
  `([?&](?:${CREDENTIAL_KEY_PATTERN})=)[^&\\s,;'"'"\`]+`,
  'gi',
);
const JSON_CREDENTIAL_PATTERN = new RegExp(
  `((["'])(?:${CREDENTIAL_KEY_PATTERN})\\2\\s*:\\s*)(?:"[^"]*"|'[^']*'|[^\\s,}\\]]+)`,
  'gi',
);
const ASSIGNED_CREDENTIAL_PATTERN = new RegExp(
  `\\b((?:${CREDENTIAL_KEY_PATTERN})\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s&?,;'"'\`}]+)`,
  'gi',
);

function sanitizeCause(cause: unknown): { readonly name?: string; readonly message: string } | string {
  if (cause instanceof Error) {
    const message = redactSensitiveCauseMessage(cause.message);
    if (cause.name === '' || cause.name === 'Error') return { message };
    return { name: cause.name, message };
  }

  return 'non-error thrown';
}

function redactSensitiveCauseMessage(message: string): string {
  return message
    .replace(SECRET_VALUE_PATTERN, REDACTED_CAUSE_VALUE)
    .replace(BEARER_TOKEN_PATTERN, `$1${REDACTED_CAUSE_VALUE}`)
    .replace(QUERY_CREDENTIAL_PATTERN, `$1${REDACTED_CAUSE_VALUE}`)
    .replace(JSON_CREDENTIAL_PATTERN, `$1"${REDACTED_CAUSE_VALUE}"`)
    .replace(ASSIGNED_CREDENTIAL_PATTERN, `$1${REDACTED_CAUSE_VALUE}`);
}
