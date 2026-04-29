import type { ComposedProjectInput } from './composed-project.js';
import type {
  DeploymentMode,
  ExternalEventBusConfig,
  ProjectAuthConfig,
  ProjectDeploymentConfig,
} from './config.js';
import { planEdge, type EdgeMiddleware, type EdgeRoute } from './edge.js';
import type { DeploymentPlanError } from './errors.js';
import { err, ok, type Result } from './result.js';

export type PlannedProject = {
  readonly orgSlug: string;
  readonly projectSlug: string;
  readonly environment: 'default';
  readonly mode: DeploymentMode;
};

export type DomainServiceWorkload = {
  readonly kind: 'domain-service';
  readonly slug: string;
  readonly serviceSlug: string;
  readonly resourceName: string;
  readonly runtime: { readonly image: string };
  readonly artifact: { readonly source: 'composed-project'; readonly serviceSlug: string };
  readonly runtimeFiles: Readonly<Record<string, string>>;
  readonly persistence: { readonly mode: 'ephemeral' };
};

export type IntegrationModuleWorkload = {
  readonly kind: 'integration-module';
  readonly slug: string;
  readonly serviceSlug: string;
  readonly resourceName: string;
  readonly image: string;
  readonly expose: boolean;
  readonly env: Readonly<Record<string, string>>;
  readonly secretRefs: Readonly<Record<string, string>>;
};

export type EdgeGatewayWorkload = {
  readonly kind: 'edge-gateway';
  readonly slug: 'edge';
  readonly resourceName: string;
  readonly image: 'nginx:1.27-alpine';
};

export type DeploymentWorkload =
  | DomainServiceWorkload
  | IntegrationModuleWorkload
  | EdgeGatewayWorkload;

export type EdgePlan = {
  readonly routes: readonly EdgeRoute[];
  readonly middleware: readonly EdgeMiddleware[];
};

export type DeploymentWarning = {
  readonly code: string;
  readonly message: string;
};

export type ProjectDeploymentPlan = {
  readonly project: PlannedProject;
  readonly infrastructure: {
    readonly eventBus: ExternalEventBusConfig;
    readonly auth?: ProjectAuthConfig;
  };
  readonly workloads: readonly DeploymentWorkload[];
  readonly edge: EdgePlan;
  readonly diagnostics: {
    readonly warnings: readonly DeploymentWarning[];
  };
};

export function buildProjectDeploymentPlan(
  project: ComposedProjectInput,
  config: ProjectDeploymentConfig,
): Result<ProjectDeploymentPlan, DeploymentPlanError> {
  const errors: DeploymentPlanError[] = [];

  if (config.mode === 'production') {
    errors.push({
      code: 'DEPLOY_PLAN_UNSUPPORTED_PRODUCTION_MODE',
      message: 'production mode is modeled but rejected until runtime production prerequisites land',
      path: 'mode',
    });
  }

  if (config.environment !== 'default') {
    errors.push({
      code: 'DEPLOY_PLAN_INVALID_ENVIRONMENT',
      message: 'the MVP accepts only environment "default"',
      path: 'environment',
    });
  }

  if (config.orgSlug.trim() === '') {
    errors.push({
      code: 'DEPLOY_PLAN_MISSING_ORG_SLUG',
      message: 'orgSlug is required for deterministic target resource names',
      path: 'orgSlug',
    });
  }

  if (config.eventBus === undefined || config.eventBus.brokers.length === 0) {
    errors.push({
      code: 'DEPLOY_PLAN_MISSING_EVENT_BUS',
      message: 'preview deployments require one project-level external Kafka/Redpanda endpoint',
      path: 'eventBus',
    });
  } else {
    validateEventBusSecurity(config.eventBus, errors);
  }

  const workloads = buildWorkloads(project, config, errors);
  const { edge, errors: edgeErrors } = planEdge(project, config, workloads);
  errors.push(...edgeErrors);

  if (errors.length > 0 || config.eventBus === undefined) return err(errors);

  return ok({
    project: {
      orgSlug: config.orgSlug,
      projectSlug: project.name,
      environment: config.environment,
      mode: config.mode,
    },
    infrastructure: {
      eventBus: config.eventBus,
      ...(config.auth !== undefined ? { auth: config.auth } : {}),
    },
    workloads,
    edge,
    diagnostics: { warnings: [] },
  });
}

function buildWorkloads(
  project: ComposedProjectInput,
  config: ProjectDeploymentConfig,
  errors: DeploymentPlanError[],
): DeploymentWorkload[] {
  const workloads: DeploymentWorkload[] = [];
  const runtimeImage = config.runtimeImage ?? 'rntme-runtime';

  for (const service of Object.values(project.services)) {
    if (service.kind === 'domain') {
      workloads.push({
        kind: 'domain-service',
        slug: service.slug,
        serviceSlug: service.slug,
        resourceName: resourceName(config.orgSlug, project.name, service.slug),
        runtime: { image: runtimeImage },
        artifact: { source: 'composed-project', serviceSlug: service.slug },
        runtimeFiles: service.runtimeFiles ?? {},
        persistence: { mode: 'ephemeral' },
      });
      continue;
    }

    const moduleConfig = config.modules?.[service.slug];
    if (moduleConfig === undefined) {
      errors.push({
        code: 'DEPLOY_PLAN_MISSING_MODULE_IMAGE',
        message: `integration module "${service.slug}" requires explicit image config`,
        service: service.slug,
        path: `modules.${service.slug}`,
      });
      continue;
    }

    workloads.push({
      kind: 'integration-module',
      slug: service.slug,
      serviceSlug: service.slug,
      resourceName: resourceName(config.orgSlug, project.name, service.slug),
      image: moduleConfig.image,
      expose: moduleConfig.expose === true,
      env: moduleConfig.env ?? {},
      secretRefs: moduleConfig.secretRefs ?? {},
    });
  }

  workloads.push({
    kind: 'edge-gateway',
    slug: 'edge',
    resourceName: resourceName(config.orgSlug, project.name, 'edge'),
    image: 'nginx:1.27-alpine',
  });

  return workloads;
}

function resourceName(orgSlug: string, projectSlug: string, workloadSlug: string): string {
  return `rntme-${orgSlug}-${projectSlug}-${workloadSlug}`;
}

function validateEventBusSecurity(
  eventBus: ExternalEventBusConfig,
  errors: DeploymentPlanError[],
): void {
  const security = eventBus.security;
  if (security?.protocol !== 'sasl_ssl') return;

  if (security.mechanism !== 'scram-sha-256' && security.mechanism !== 'scram-sha-512') {
    errors.push({
      code: 'DEPLOY_PLAN_EVENT_BUS_SASL_MECHANISM_UNSUPPORTED',
      message: `unsupported SASL mechanism "${security.mechanism}"`,
      path: 'eventBus.security.mechanism',
    });
  }

  const secretRefs = security.secretRefs;
  if (!isNonEmptyString(secretRefs?.username) || !isNonEmptyString(secretRefs?.password)) {
    errors.push({
      code: 'DEPLOY_PLAN_EVENT_BUS_SASL_INCOMPLETE',
      message: 'sasl_ssl requires secretRefs.username and secretRefs.password',
      path: 'eventBus.security.secretRefs',
    });
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
