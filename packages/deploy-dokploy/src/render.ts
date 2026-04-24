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

export type RenderedDokployResource = {
  readonly logicalId: string;
  readonly kind: 'application';
  readonly workloadKind: DeploymentWorkload['kind'];
  readonly workloadSlug: string;
  readonly name: string;
  readonly image: string;
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

  const resources = plan.workloads.map((workload) =>
    renderResource(plan, workload, nginxConfig.value),
  );
  const uiRoute = plan.edge.routes.find((route) => route.kind === 'ui');
  const publicRoutes = plan.edge.routes.map((route) => ({
    routeId: route.id,
    url: joinPublicUrl(config.publicBaseUrl, route.path),
  }));
  const urls: RenderedDokployPlan['urls'] =
    uiRoute === undefined
      ? { projectUrl: config.publicBaseUrl, publicRoutes }
      : {
          projectUrl: config.publicBaseUrl,
          uiUrl: joinPublicUrl(config.publicBaseUrl, uiRoute.path),
          publicRoutes,
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
    resources,
    urls,
    warnings: plan.diagnostics.warnings.map((warning) => warning.message),
  };

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
    ],
    labels,
  };
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
