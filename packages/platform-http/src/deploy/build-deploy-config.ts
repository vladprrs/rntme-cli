import type { DokployTargetConfig } from '@rntme-cli/deploy-dokploy';
import type {
  DeploymentPolicyConfig,
  IntegrationModuleDeploymentConfig,
  ProjectDeploymentConfig,
} from '@rntme-cli/deploy-core';
import type { DeployTarget } from '@rntme-cli/platform-core';
import { normalizeDokployBaseUrl } from './dokploy-client-factory.js';

type DeployConfigOverrides = {
  readonly integrationModuleImages?: Record<string, string>;
  readonly policyOverrides?: Record<string, unknown>;
  readonly publicBaseUrl?: string;
  readonly runtimeImage?: string;
};

export function buildProjectDeploymentConfig(
  target: DeployTarget,
  orgSlug: string,
  configOverrides: Record<string, unknown>,
): ProjectDeploymentConfig {
  const overrides = configOverrides as DeployConfigOverrides;
  const modules: Record<string, IntegrationModuleDeploymentConfig> = {};
  for (const [slug, image] of Object.entries(overrides.integrationModuleImages ?? {})) {
    modules[slug] = { image };
  }

  const eventBus = {
    kind: target.eventBus.kind,
    mode: target.eventBus.mode ?? 'external',
    brokers: target.eventBus.brokers,
    ...(target.eventBus.topicPrefix === undefined ? {} : { topicPrefix: target.eventBus.topicPrefix }),
    ...(target.eventBus.security === undefined
      ? {}
      : {
          security: {
            protocol: target.eventBus.security.protocol,
            ...(target.eventBus.security.secretRefs === undefined
              ? {}
              : { secretRefs: target.eventBus.security.secretRefs }),
          },
        }),
  };

  return {
    orgSlug,
    environment: 'default',
    mode: 'preview',
    eventBus,
    modules,
    policies: {
      ...(target.policyValues as DeploymentPolicyConfig),
      ...((overrides.policyOverrides ?? {}) as DeploymentPolicyConfig),
    },
    ...(overrides.runtimeImage ? { runtimeImage: overrides.runtimeImage } : {}),
  };
}

export function buildDokployTargetConfig(
  target: DeployTarget,
  configOverrides: Record<string, unknown>,
): DokployTargetConfig {
  const overrides = configOverrides as DeployConfigOverrides;
  return {
    endpoint: normalizeDokployBaseUrl(target.dokployUrl),
    allowCreateProject: target.allowCreateProject,
    publicBaseUrl: overrides.publicBaseUrl ?? target.publicBaseUrl,
    ...(target.dokployProjectId === null ? {} : { projectId: target.dokployProjectId }),
    ...(target.dokployProjectName === null ? {} : { projectName: target.dokployProjectName }),
  };
}
