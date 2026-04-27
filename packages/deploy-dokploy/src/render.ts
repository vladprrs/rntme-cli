import { createHash } from 'node:crypto';
import type { DeploymentWorkload, ProjectDeploymentPlan } from '@rntme-cli/deploy-core';
import type { DokployTargetConfig } from './config.js';
import type { DokployDeploymentError } from './errors.js';
import { dokployLabels, dokployResourceName } from './names.js';
import { renderNginxConfig } from './nginx.js';
import { err, ok, type Result } from './result.js';

export type RenderedDokployProject =
  | { readonly mode: 'existing'; readonly projectId: string }
  | { readonly mode: 'create'; readonly projectName: string };

export type RenderedDokployDeployment = {
  readonly orgSlug: string;
  readonly projectSlug: string;
  readonly environment: ProjectDeploymentPlan['project']['environment'];
  readonly mode: ProjectDeploymentPlan['project']['mode'];
};

export type RenderedEnvVar = {
  readonly name: string;
  readonly value: string;
  readonly secret: boolean;
};

export type RenderedDomainArtifactBuild = {
  readonly kind: 'domain-service-artifact';
  readonly baseImage: string;
  readonly image: string;
  readonly artifact: {
    readonly source: 'composed-project';
    readonly serviceSlug: string;
  };
  readonly context: {
    readonly kind: 'generated';
    readonly serviceSlug: string;
    readonly files: readonly string[];
  };
};

export type RenderedDokployPort = {
  readonly containerPort: number;
  readonly protocol: 'http';
};

export type RenderedDokployIngress = {
  readonly publicBaseUrl: string;
  readonly containerPort: number;
  readonly healthPath: '/health';
  readonly routes: readonly {
    readonly routeId: string;
    readonly path: string;
    readonly url: string;
  }[];
};

export type RenderedDokployResource = {
  readonly logicalId: string;
  readonly kind: 'application';
  readonly workloadKind: DeploymentWorkload['kind'];
  readonly workloadSlug: string;
  readonly name: string;
  readonly image: string;
  readonly build?: RenderedDomainArtifactBuild;
  readonly ports?: readonly RenderedDokployPort[];
  readonly ingress?: RenderedDokployIngress;
  readonly env: readonly RenderedEnvVar[];
  readonly labels: Readonly<Record<string, string>>;
  readonly files?: Readonly<Record<string, string>>;
};

export type RenderedDokployPlan = {
  readonly target: { readonly kind: 'dokploy'; readonly endpoint: string };
  readonly targetProject: RenderedDokployProject;
  readonly deployment: RenderedDokployDeployment;
  readonly resources: readonly RenderedDokployResource[];
  readonly urls: {
    readonly projectUrl: string;
    readonly uiUrl?: string;
    readonly publicRoutes: readonly { readonly routeId: string; readonly url: string }[];
  };
  readonly digest: string;
  readonly warnings: readonly string[];
};

export function renderDokployPlan(
  plan: ProjectDeploymentPlan,
  config: DokployTargetConfig,
): Result<RenderedDokployPlan, DokployDeploymentError> {
  const targetProject = resolveProject(config);
  if (targetProject === null) {
    return err([
      {
        code: 'DEPLOY_RENDER_DOKPLOY_MISSING_PROJECT',
        message: 'set projectId or projectName with allowCreateProject: true',
      },
    ]);
  }

  const upstreams = Object.fromEntries(
    plan.workloads
      .filter((w) => w.kind !== 'edge-gateway')
      .map((w) => [
        w.slug,
        `http://${dokployResourceName(plan.project.orgSlug, plan.project.projectSlug, w.slug)}:3000`,
      ]),
  );
  const nginxConfig = renderEdgeGatewayConfig(plan, upstreams);
  if (!nginxConfig.ok) return nginxConfig;

  const missingRuntimeFiles = plan.workloads.find(
    (workload) => workload.kind === 'domain-service' && Object.keys(workload.runtimeFiles).length === 0,
  );
  if (missingRuntimeFiles !== undefined) {
    return err([
      {
        code: 'DEPLOY_RENDER_DOKPLOY_MISSING_RUNTIME_FILES',
        message: `domain service "${missingRuntimeFiles.slug}" has no runtime artifact files`,
        resource: missingRuntimeFiles.resourceName,
      },
    ]);
  }

  const resources = plan.workloads.map((workload) =>
    renderResource(plan, workload, nginxConfig.value),
  );
  const uiRoute = plan.edge.routes.find((route) => route.kind === 'ui');
  const publicRoutes = plan.edge.routes.map((route) => ({
    routeId: route.id,
    path: route.path,
    url: joinPublicUrl(config.publicBaseUrl, route.path),
  }));
  const urls: RenderedDokployPlan['urls'] =
    uiRoute === undefined
      ? { projectUrl: config.publicBaseUrl, publicRoutes: publicRoutes.map(stripRoutePath) }
      : {
          projectUrl: config.publicBaseUrl,
          uiUrl: joinPublicUrl(config.publicBaseUrl, uiRoute.path),
          publicRoutes: publicRoutes.map(stripRoutePath),
        };
  const renderedWithoutDigest = {
    target: { kind: 'dokploy' as const, endpoint: config.endpoint },
    targetProject,
    deployment: {
      orgSlug: plan.project.orgSlug,
      projectSlug: plan.project.projectSlug,
      environment: plan.project.environment,
      mode: plan.project.mode,
    },
    resources: resources.map((resource) =>
      resource.workloadKind === 'edge-gateway'
        ? {
            ...resource,
            ports: [{ containerPort: 8080, protocol: 'http' as const }],
            ingress: {
              publicBaseUrl: config.publicBaseUrl,
              containerPort: 8080,
              healthPath: '/health' as const,
              routes: publicRoutes,
            },
          }
        : resource,
    ),
    urls,
    warnings: plan.diagnostics.warnings.map((warning) => warning.message),
  };
  const collision = findNameCollision(renderedWithoutDigest.resources);
  if (collision !== null) {
    return err([
      {
        code: 'DEPLOY_RENDER_DOKPLOY_NAME_COLLISION',
        message: `rendered Dokploy resource name "${collision}" is not unique`,
        resource: collision,
      },
    ]);
  }

  return ok({
    ...renderedWithoutDigest,
    digest: digest(renderedWithoutDigest),
  });
}

function renderEdgeGatewayConfig(
  plan: ProjectDeploymentPlan,
  upstreams: Readonly<Record<string, string>>,
): Result<string, DokployDeploymentError> {
  try {
    return ok(renderNginxConfig(plan.edge, upstreams));
  } catch (cause) {
    return err([
      {
        code: 'DEPLOY_RENDER_DOKPLOY_INVALID_NGINX_CONFIG',
        message: 'failed to render Nginx edge gateway config',
        cause,
      },
    ]);
  }
}

function resolveProject(config: DokployTargetConfig): RenderedDokployProject | null {
  if (config.projectId !== undefined && config.projectId !== '') {
    return { mode: 'existing', projectId: config.projectId };
  }
  if (
    config.projectName !== undefined &&
    config.projectName !== '' &&
    config.allowCreateProject === true
  ) {
    return { mode: 'create', projectName: config.projectName };
  }
  return null;
}

function renderResource(
  plan: ProjectDeploymentPlan,
  workload: DeploymentWorkload,
  nginxConfig: string,
): RenderedDokployResource {
  const name = dokployResourceName(plan.project.orgSlug, plan.project.projectSlug, workload.slug);
  const labels = dokployLabels(
    plan.project.orgSlug,
    plan.project.projectSlug,
    plan.project.environment,
    workload.slug,
  );

  if (workload.kind === 'edge-gateway') {
    return {
      logicalId: workload.slug,
      kind: 'application',
      workloadKind: workload.kind,
      workloadSlug: workload.slug,
      name,
      image: workload.image,
      env: [],
      labels,
      files: { '/etc/nginx/nginx.conf': nginxConfig },
    };
  }

  if (workload.kind === 'integration-module') {
    return {
      logicalId: workload.slug,
      kind: 'application',
      workloadKind: workload.kind,
      workloadSlug: workload.slug,
      name,
      image: workload.image,
      env: [
        ...sortedEntries(workload.env).map(([envName, value]) => ({
          name: envName,
          value,
          secret: false,
        })),
        ...sortedEntries(workload.secretRefs).map(([envName, ref]) => ({
          name: envName,
          value: ref,
          secret: true,
        })),
      ],
      labels,
    };
  }

  if (workload.kind === 'domain-service') {
    return {
      logicalId: workload.slug,
      kind: 'application',
      workloadKind: workload.kind,
      workloadSlug: workload.slug,
      name,
      image: workload.runtime.image,
      env: [
        {
          name: 'RNTME_EVENT_BUS_BROKERS',
          value: plan.infrastructure.eventBus.brokers.join(','),
          secret: false,
        },
        {
          name: 'RNTME_PERSISTENCE_MODE',
          value: workload.persistence.mode,
          secret: false,
        },
        {
          name: 'RNTME_ARTIFACTS_DIR',
          value: '/srv/artifacts',
          secret: false,
        },
      ],
      labels,
      files: runtimeFileMounts(workload.runtimeFiles),
    };
  }

  return assertNever(workload);
}

function runtimeFileMounts(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    sortedEntries(files).map(([path, content]) => [`/srv/artifacts/${path.replace(/^\/+/, '')}`, content]),
  );
}

function findNameCollision(resources: readonly RenderedDokployResource[]): string | null {
  const seen = new Set<string>();
  for (const resource of resources) {
    if (seen.has(resource.name)) return resource.name;
    seen.add(resource.name);
  }
  return null;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function joinPublicUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(path, normalizedBase).toString();
}

function sortedEntries(value: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
}

function stripRoutePath(route: {
  readonly routeId: string;
  readonly path: string;
  readonly url: string;
}): { readonly routeId: string; readonly url: string } {
  return { routeId: route.routeId, url: route.url };
}

function assertNever(value: never): never {
  throw new Error(`unhandled workload kind: ${JSON.stringify(value)}`);
}
