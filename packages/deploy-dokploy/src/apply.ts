import type { DokployClient } from './client.js';
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
  readonly action: 'created' | 'updated';
};

export type DeploymentApplyResult = {
  readonly target: {
    readonly kind: 'dokploy';
    readonly projectId: string;
  };
  readonly deployment: {
    readonly orgSlug?: string;
    readonly projectSlug?: string;
    readonly environment: 'default';
    readonly mode: 'preview';
  };
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
    const { projectId } = await client.ensureProject(rendered.targetProject);

    for (const resource of rendered.resources) {
      const existingResult = await findExistingApplication(client, projectId, resource, applied);
      if (!existingResult.ok) return existingResult;

      const existing = existingResult.value;
      if (existing === null) {
        const createResult = await createApplication(client, projectId, resource, applied);
        if (!createResult.ok) return createResult;
        applied.push(createResult.value);
      } else {
        const updateResult = await updateApplication(client, existing.id, resource, applied);
        if (!updateResult.ok) return updateResult;
        applied.push(updateResult.value);
      }
    }

    return ok({
      target: { kind: 'dokploy', projectId },
      deployment: {
        environment: 'default',
        mode: 'preview',
      },
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
  projectId: string,
  resource: RenderedDokployResource,
  applied: readonly DeploymentApplyResource[],
): Promise<Result<{ readonly id: string; readonly name: string } | null, DokployDeploymentError>> {
  try {
    return ok(await client.findApplicationByName(projectId, resource.name));
  } catch (cause) {
    return partialFailure(cause, resource, applied, 'find');
  }
}

async function createApplication(
  client: DokployClient,
  projectId: string,
  resource: RenderedDokployResource,
  applied: readonly DeploymentApplyResource[],
): Promise<Result<DeploymentApplyResource, DokployDeploymentError>> {
  try {
    const target = await client.createApplication(projectId, resource);
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

function sanitizeCause(cause: unknown): { readonly name?: string; readonly message: string } | string {
  if (cause instanceof Error) {
    const message = redactSensitiveText(cause.message);
    if (cause.name === '' || cause.name === 'Error') return { message };
    return { name: cause.name, message };
  }

  return 'non-error thrown';
}

function redactSensitiveText(value: string): string {
  return value.replace(/dokploy-token-[^\s"'`,;)]*/giu, '[redacted]');
}
