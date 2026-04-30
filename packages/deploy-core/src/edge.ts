import type { ComposedProjectInput } from './composed-project.js';
import type { DeploymentPolicyConfig, ProjectDeploymentConfig } from './config.js';
import type { DeploymentPlanError } from './errors.js';
import type { DeploymentWorkload } from './plan.js';

export type EdgeRoute = {
  readonly id: string;
  readonly kind: 'ui' | 'http';
  readonly path: string;
  readonly targetService: string;
  readonly targetWorkload: string;
};

export type EdgeMiddleware =
  | {
      readonly mountTarget: string;
      readonly name: string;
      readonly kind: 'request-context';
      readonly policy: string;
      readonly config: NonNullable<DeploymentPolicyConfig['requestContext']>[string];
    }
  | {
      readonly mountTarget: string;
      readonly name: string;
      readonly kind: 'rate-limit';
      readonly policy: string;
      readonly config: NonNullable<DeploymentPolicyConfig['rateLimit']>[string];
    }
  | {
      readonly mountTarget: string;
      readonly name: string;
      readonly kind: 'body-limit';
      readonly policy: string;
      readonly config: NonNullable<DeploymentPolicyConfig['bodyLimit']>[string];
    }
  | {
      readonly mountTarget: string;
      readonly name: string;
      readonly kind: 'timeout';
      readonly policy: string;
      readonly config: NonNullable<DeploymentPolicyConfig['timeout']>[string];
    }
  | {
      readonly mountTarget: string;
      readonly name: string;
      readonly kind: 'auth';
      readonly provider: string;
      readonly audience: string;
      readonly moduleSlug: string;
      readonly policy?: string;
      readonly config?: unknown;
    };

export type PlannedEdge = {
  readonly routes: readonly EdgeRoute[];
  readonly middleware: readonly EdgeMiddleware[];
};

type SupportedMiddlewareKind = EdgeMiddleware['kind'];

type MiddlewarePolicyByKind = {
  readonly 'request-context': NonNullable<DeploymentPolicyConfig['requestContext']>[string];
  readonly 'rate-limit': NonNullable<DeploymentPolicyConfig['rateLimit']>[string];
  readonly 'body-limit': NonNullable<DeploymentPolicyConfig['bodyLimit']>[string];
  readonly timeout: NonNullable<DeploymentPolicyConfig['timeout']>[string];
  readonly auth: never;
};

const supportedMiddlewareKinds = new Set<SupportedMiddlewareKind>([
  'request-context',
  'rate-limit',
  'body-limit',
  'timeout',
  'auth',
]);

export function planEdge(
  project: ComposedProjectInput,
  config: ProjectDeploymentConfig,
  workloads: readonly DeploymentWorkload[],
): { edge: PlannedEdge; errors: DeploymentPlanError[] } {
  const errors: DeploymentPlanError[] = [];
  const routes: EdgeRoute[] = [];
  const workloadByService = new Map<string, DeploymentWorkload>();

  for (const workload of workloads) {
    if (workload.kind !== 'edge-gateway') {
      workloadByService.set(workload.serviceSlug, workload);
    }
  }

  for (const [path, service] of Object.entries(project.routes?.ui ?? {})) {
    addRoute('ui', path, service);
  }

  for (const [path, service] of Object.entries(project.routes?.http ?? {})) {
    addRoute('http', path, service);
  }

  const middleware = planMiddleware(
    project,
    config,
    new Set(routes.map((route) => route.id)),
    workloads,
    errors,
  );

  return { edge: { routes, middleware }, errors };

  function addRoute(kind: 'ui' | 'http', path: string, service: string): void {
    const workload = workloadByService.get(service);
    if (workload === undefined) {
      errors.push({
        code: 'DEPLOY_PLAN_ROUTE_TARGET_MISSING_WORKLOAD',
        message: `route ${kind}:${path} targets service "${service}" but no workload exists`,
        service,
        route: path,
      });
      return;
    }

    if (workload.kind === 'integration-module' && workload.expose !== true) {
      errors.push({
        code: 'DEPLOY_PLAN_PUBLIC_MODULE_NOT_EXPOSED',
        message: `integration module "${service}" must set expose: true before receiving public routes`,
        service,
        route: path,
      });
    }

    routes.push({
      id: `${kind}:${path}`,
      kind,
      path,
      targetService: service,
      targetWorkload: workload.slug,
    });
  }
}

function planMiddleware(
  project: ComposedProjectInput,
  config: ProjectDeploymentConfig,
  routeIds: ReadonlySet<string>,
  workloads: readonly DeploymentWorkload[],
  errors: DeploymentPlanError[],
): EdgeMiddleware[] {
  const planned: EdgeMiddleware[] = [];
  const declarations = project.middleware ?? {};
  const integrationWorkloads = new Map(
    workloads
      .filter((workload) => workload.kind === 'integration-module')
      .map((workload) => [workload.slug, workload]),
  );

  for (const [name, decl] of Object.entries(declarations)) {
    if (!isSupportedMiddlewareKind(decl.kind)) {
      errors.push({
        code: 'DEPLOY_PLAN_UNSUPPORTED_MIDDLEWARE',
        message: `middleware "${name}" uses unsupported kind "${decl.kind}"`,
        middleware: name,
      });
    }
  }

  for (const mount of project.mounts ?? []) {
    if (!routeIds.has(mount.target)) {
      errors.push({
        code: 'DEPLOY_PLAN_MOUNT_TARGET_MISSING_ROUTE',
        message: `middleware mount target "${mount.target}" does not match a planned route`,
        route: mount.target,
        path: `mounts.${mount.target}.target`,
      });
      continue;
    }

    for (const middlewareName of mount.use) {
      const decl = declarations[middlewareName];
      if (decl === undefined) {
        errors.push({
          code: 'DEPLOY_PLAN_MISSING_MIDDLEWARE_DECLARATION',
          message: `middleware mount references "${middlewareName}" but no declaration exists`,
          middleware: middlewareName,
          path: `mounts.${mount.target}.use.${middlewareName}`,
        });
        continue;
      }
      if (!isSupportedMiddlewareKind(decl.kind)) continue;
      const policy = decl.policy ?? 'default';

      if (decl.kind === 'auth') {
        if (!isNonEmptyString(decl.provider) || !isNonEmptyString(decl.audience) || !isNonEmptyString(decl.moduleSlug)) {
          errors.push({
            code: 'DEPLOY_PLAN_AUTH_MIDDLEWARE_INCOMPLETE',
            message: `auth middleware "${middlewareName}" requires provider, audience, and moduleSlug`,
            middleware: middlewareName,
          });
          continue;
        }

        const moduleWorkload = integrationWorkloads.get(decl.moduleSlug);
        if (moduleWorkload === undefined) {
          errors.push({
            code: 'DEPLOY_PLAN_AUTH_MODULE_WORKLOAD_MISSING',
            message: `auth middleware "${middlewareName}" references missing integration module workload "${decl.moduleSlug}"`,
            middleware: middlewareName,
            service: decl.moduleSlug,
          });
          continue;
        }

        if (decl.provider === 'auth0') {
          if (!isNonEmptyString(moduleWorkload.env.AUTH0_DOMAIN)) {
            errors.push({
              code: 'DEPLOY_PLAN_AUTH_MODULE_ENV_INCOMPLETE',
              message: `auth module workload "${decl.moduleSlug}" missing AUTH0_DOMAIN env`,
              service: decl.moduleSlug,
              path: `modules.${decl.moduleSlug}.env.AUTH0_DOMAIN`,
            });
            continue;
          }
        }

        planned.push({
          mountTarget: mount.target,
          name: middlewareName,
          kind: decl.kind,
          provider: decl.provider,
          audience: decl.audience,
          moduleSlug: decl.moduleSlug,
          ...(decl.policy !== undefined ? { policy: decl.policy } : {}),
          ...(decl.config !== undefined ? { config: decl.config } : {}),
        });
        continue;
      }

      if (decl.kind === 'request-context') {
        const resolved = resolvePolicy(decl.kind, middlewareName, policy, config.policies, errors);
        if (resolved !== null) {
          planned.push({
            mountTarget: mount.target,
            name: middlewareName,
            kind: decl.kind,
            policy,
            config: resolved,
          });
        }
        continue;
      }

      if (decl.kind === 'rate-limit') {
        const resolved = resolvePolicy(decl.kind, middlewareName, policy, config.policies, errors);
        if (resolved !== null) {
          planned.push({
            mountTarget: mount.target,
            name: middlewareName,
            kind: decl.kind,
            policy,
            config: resolved,
          });
        }
        continue;
      }

      if (decl.kind === 'body-limit') {
        const resolved = resolvePolicy(decl.kind, middlewareName, policy, config.policies, errors);
        if (resolved !== null) {
          planned.push({
            mountTarget: mount.target,
            name: middlewareName,
            kind: decl.kind,
            policy,
            config: resolved,
          });
        }
        continue;
      }

      const resolved = resolvePolicy(decl.kind, middlewareName, policy, config.policies, errors);
      if (resolved !== null) {
        planned.push({
          mountTarget: mount.target,
          name: middlewareName,
          kind: decl.kind,
          policy,
          config: resolved,
        });
      }
    }
  }

  return planned;
}

function isSupportedMiddlewareKind(kind: string): kind is SupportedMiddlewareKind {
  return supportedMiddlewareKinds.has(kind as SupportedMiddlewareKind);
}

function resolvePolicy<K extends SupportedMiddlewareKind>(
  kind: K,
  middlewareName: string,
  policy: string,
  policies: DeploymentPolicyConfig | undefined,
  errors: DeploymentPlanError[],
): MiddlewarePolicyByKind[K] | null {
  const table = policyTable(kind, policies);
  const value = table?.[policy];
  if (value === undefined) {
    errors.push({
      code: 'DEPLOY_PLAN_MISSING_POLICY_VALUE',
      message: `middleware "${middlewareName}" references missing policy "${policy}"`,
      middleware: middlewareName,
      policy,
    });
    return null;
  }
  return value;
}

function policyTable<K extends SupportedMiddlewareKind>(
  kind: K,
  policies: DeploymentPolicyConfig | undefined,
): Readonly<Record<string, MiddlewarePolicyByKind[K]>> | undefined {
  switch (kind) {
    case 'request-context':
      return policies?.requestContext as Readonly<Record<string, MiddlewarePolicyByKind[K]>> | undefined;
    case 'rate-limit':
      return policies?.rateLimit as Readonly<Record<string, MiddlewarePolicyByKind[K]>> | undefined;
    case 'body-limit':
      return policies?.bodyLimit as Readonly<Record<string, MiddlewarePolicyByKind[K]>> | undefined;
    case 'timeout':
      return policies?.timeout as Readonly<Record<string, MiddlewarePolicyByKind[K]>> | undefined;
    case 'auth':
      return undefined;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
