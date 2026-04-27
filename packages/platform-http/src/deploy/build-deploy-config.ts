import { createHash } from 'node:crypto';
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

type PublicBaseUrlContext = {
  readonly orgSlug: string;
  readonly projectSlug: string;
  readonly environment: string;
  readonly publicDeployDomain?: string;
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
  publicBaseUrlContext?: PublicBaseUrlContext,
): DokployTargetConfig {
  const overrides = configOverrides as DeployConfigOverrides;
  const publicBaseUrl =
    overrides.publicBaseUrl ??
    target.publicBaseUrl ??
    (publicBaseUrlContext === undefined ? undefined : derivePublicBaseUrl(publicBaseUrlContext));
  if (publicBaseUrl === null || publicBaseUrl === undefined || publicBaseUrl === '') {
    throw new Error('DEPLOY_TARGET_PUBLIC_BASE_URL_REQUIRED');
  }
  return {
    endpoint: normalizeDokployBaseUrl(target.dokployUrl),
    allowCreateProject: target.allowCreateProject,
    publicBaseUrl,
    ...(target.dokployProjectId === null ? {} : { projectId: target.dokployProjectId }),
    ...(target.dokployProjectName === null ? {} : { projectName: target.dokployProjectName }),
  };
}

export function derivePublicBaseUrl(input: PublicBaseUrlContext): string {
  const label = compactDnsLabel([input.orgSlug, input.projectSlug, input.environment]);
  return `https://${label}.${normalizePublicDeployDomain(input.publicDeployDomain ?? 'rntme.com')}`;
}

function compactDnsLabel(parts: readonly string[]): string {
  const label = parts.map(normalizeDnsPart).join('-');
  if (label.length <= 63) return label;
  const hash = createHash('sha256').update(label).digest('hex').slice(0, 12);
  return `${label.slice(0, 50).replace(/-+$/g, '')}-${hash}`;
}

function normalizeDnsPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length === 0 ? 'unknown' : normalized;
}

function normalizePublicDeployDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\*\./, '')
    .replace(/\.$/, '');
}
