import { clearInterval, setInterval } from 'node:timers';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { loadComposedBlueprint } from '@rntme/blueprint';
import type { ComposedProjectInput, ProjectDeploymentPlan } from '@rntme-cli/deploy-core';
import { buildProjectDeploymentPlan } from '@rntme-cli/deploy-core';
import type { DeploymentApplyResult, RenderedDokployPlan } from '@rntme-cli/deploy-dokploy';
import { applyDokployPlan, renderDokployPlan } from '@rntme-cli/deploy-dokploy';
import {
  isOk,
  type BlobStore,
  type CanonicalBundle,
  type DeployTarget,
  type DeployTargetRepo,
  type DeployTargetWithSecret,
  type DeploymentRepo,
  type ProjectVersionRepo,
  type VerificationReport,
} from '@rntme-cli/platform-core';
import type { Logger } from 'pino';
import { buildDokployTargetConfig, buildProjectDeploymentConfig } from './build-deploy-config.js';
import type { DokployClientFactory } from './dokploy-client-factory.js';
import { redact } from './log-redactor.js';
import type { SmokeVerifier } from './smoke-verifier.js';

type ResultLike<T, E = { readonly code: string; readonly message: string }> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly E[] };

export type TxRepos = {
  readonly deployments: DeploymentRepo;
  readonly projectVersions: ProjectVersionRepo;
  readonly deployTargets: DeployTargetRepo;
};

export type ExecutorDeps = {
  readonly blob: BlobStore;
  readonly withOrgTx: <T>(orgId: string, fn: (repos: TxRepos) => Promise<T>) => Promise<T>;
  readonly orgSlugFor: (orgId: string) => Promise<string>;
  readonly dokployClientFactory: DokployClientFactory;
  readonly smoker: SmokeVerifier;
  readonly logger: Pick<Logger, 'error' | 'warn' | 'info'>;
  readonly loadComposed?: (dir: string) => ResultLike<ComposedProjectInput>;
  readonly planProject?: typeof buildProjectDeploymentPlan;
  readonly renderPlan?: typeof renderDokployPlan;
  readonly applyPlan?: typeof applyDokployPlan;
  readonly heartbeatMs?: number;
};

type DeploymentContext = {
  readonly projectVersionId: string;
  readonly targetId: string;
  readonly configOverrides: Record<string, unknown>;
  readonly bundleBlobKey: string;
};

export async function runDeployment(
  deploymentId: string,
  orgId: string,
  deps: ExecutorDeps,
): Promise<void> {
  const heartbeat = setInterval(() => {
    void deps
      .withOrgTx(orgId, (repos) => repos.deployments.touchHeartbeat(deploymentId))
      .catch(() => undefined);
  }, deps.heartbeatMs ?? 5_000);
  let tmpDir: string | null = null;

  try {
    const ctx = await startAndResolveContext(deploymentId, orgId, deps);
    await appendLog(deps, deploymentId, orgId, 'info', 'init', 'Starting deployment');
    await deps.withOrgTx(orgId, (repos) => repos.deployments.touchHeartbeat(deploymentId));

    const raw = await deps.blob.getRaw(ctx.bundleBlobKey);
    if (!isOk(raw)) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: 'DEPLOY_EXECUTOR_BLOB_FETCH_FAILED',
        errorMessage: raw.errors[0]?.message ?? 'unable to fetch project version bundle',
      });
      return;
    }

    const bundle = JSON.parse(gunzipSync(raw.value).toString('utf8')) as CanonicalBundle;
    tmpDir = await materializeBundle(bundle);

    await appendLog(deps, deploymentId, orgId, 'info', 'plan', 'Re-validating blueprint');
    const composed = (deps.loadComposed ?? defaultLoadComposed)(tmpDir);
    if (!composed.ok) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: 'DEPLOY_EXECUTOR_BLUEPRINT_REVALIDATION_FAILED',
        errorMessage: redact(errorSummary(composed.errors)),
      });
      return;
    }

    const target = await resolveTarget(deps, orgId, ctx.targetId);
    const orgSlug = await deps.orgSlugFor(orgId);
    const redactedTarget = redactTarget(target);
    const config = buildProjectDeploymentConfig(redactedTarget, orgSlug, ctx.configOverrides);
    const plan = (deps.planProject ?? buildProjectDeploymentPlan)(composed.value, config);
    if (!plan.ok) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: plan.errors[0]?.code ?? 'DEPLOY_PLAN_UNKNOWN',
        errorMessage: redact(errorSummary(plan.errors)),
      });
      return;
    }

    await appendLog(deps, deploymentId, orgId, 'info', 'render', 'Rendering Dokploy plan');
    const rendered = (deps.renderPlan ?? renderDokployPlan)(
      plan.value as ProjectDeploymentPlan,
      buildDokployTargetConfig(redactedTarget, ctx.configOverrides),
    );
    if (!rendered.ok) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: rendered.errors[0]?.code ?? 'DEPLOY_RENDER_DOKPLOY_UNKNOWN',
        errorMessage: redact(errorSummary(rendered.errors)),
      });
      return;
    }
    await deps.withOrgTx(orgId, (repos) =>
      repos.deployments.setRenderedDigest(deploymentId, rendered.value.digest),
    );

    await appendLog(deps, deploymentId, orgId, 'info', 'apply', 'Applying Dokploy plan');
    const applied = await (deps.applyPlan ?? applyDokployPlan)(
      rendered.value as RenderedDokployPlan,
      deps.dokployClientFactory(target),
    );
    if (!applied.ok) {
      await finalize(deps, deploymentId, orgId, 'failed', {
        errorCode: applied.errors[0]?.code ?? 'DEPLOY_APPLY_DOKPLOY_UNKNOWN',
        errorMessage: redact(errorSummary(applied.errors)),
      });
      return;
    }
    await deps.withOrgTx(orgId, (repos) =>
      repos.deployments.setApplyResult(
        deploymentId,
        applied.value as unknown as Record<string, unknown>,
      ),
    );

    await appendLog(deps, deploymentId, orgId, 'info', 'verify', 'Running smoke verification');
    const verification = await deps.smoker.verify(applied.value as DeploymentApplyResult);
    await finalizeFromVerification(deps, deploymentId, orgId, verification);
  } catch (cause) {
    deps.logger.error({ deploymentId, cause }, 'deploy executor failed');
    await finalize(deps, deploymentId, orgId, 'failed', {
      errorCode: 'DEPLOY_EXECUTOR_UNCAUGHT',
      errorMessage: redact(cause instanceof Error ? cause.message : String(cause)),
    });
  } finally {
    clearInterval(heartbeat);
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function startAndResolveContext(
  deploymentId: string,
  orgId: string,
  deps: ExecutorDeps,
): Promise<DeploymentContext> {
  return deps.withOrgTx(orgId, async (repos) => {
    const startedAt = new Date();
    const transition = await repos.deployments.transition(deploymentId, 'running', { startedAt });
    if (!isOk(transition)) throw new Error(transition.errors[0]?.code ?? 'DEPLOYMENT_INVALID_TRANSITION');
    const deployment = await repos.deployments.getById(deploymentId);
    if (!isOk(deployment) || !deployment.value) throw new Error('DEPLOYMENT_NOT_FOUND');
    const version = await repos.projectVersions.getById(deployment.value.projectVersionId);
    if (!isOk(version) || !version.value) throw new Error('PROJECT_VERSION_NOT_FOUND');
    return {
      projectVersionId: deployment.value.projectVersionId,
      targetId: deployment.value.targetId,
      configOverrides: deployment.value.configOverrides,
      bundleBlobKey: version.value.bundleBlobKey,
    };
  });
}

async function resolveTarget(
  deps: ExecutorDeps,
  orgId: string,
  targetId: string,
): Promise<DeployTargetWithSecret> {
  return deps.withOrgTx(orgId, async (repos) => {
    const target = await repos.deployTargets.getWithSecretById(targetId);
    if (!isOk(target) || !target.value) throw new Error('DEPLOY_TARGET_NOT_FOUND');
    return target.value;
  });
}

async function appendLog(
  deps: ExecutorDeps,
  deploymentId: string,
  orgId: string,
  level: 'info' | 'warn' | 'error',
  step: string,
  message: string,
): Promise<void> {
  await deps.withOrgTx(orgId, async (repos) => {
    await repos.deployments.appendLog({ deploymentId, orgId, level, step, message: redact(message) });
  });
}

async function finalizeFromVerification(
  deps: ExecutorDeps,
  deploymentId: string,
  orgId: string,
  verificationReport: VerificationReport,
): Promise<void> {
  if (verificationReport.ok) {
    await finalize(deps, deploymentId, orgId, 'succeeded', { verificationReport });
    return;
  }
  if (verificationReport.partialOk) {
    await finalize(deps, deploymentId, orgId, 'succeeded_with_warnings', {
      verificationReport,
      warnings: ['smoke verification completed with warnings'],
    });
    return;
  }
  await finalize(deps, deploymentId, orgId, 'failed', {
    errorCode: 'DEPLOY_EXECUTOR_SMOKE_FAILED',
    errorMessage: 'smoke verification failed',
    verificationReport,
  });
}

async function finalize(
  deps: ExecutorDeps,
  deploymentId: string,
  orgId: string,
  status: 'succeeded' | 'succeeded_with_warnings' | 'failed' | 'failed_orphaned',
  args: {
    readonly errorCode?: string;
    readonly errorMessage?: string;
    readonly verificationReport?: VerificationReport;
    readonly warnings?: unknown[];
  },
): Promise<void> {
  await deps.withOrgTx(orgId, async (repos) => {
    const result = await repos.deployments.finalize(deploymentId, { status, ...args });
    if (!isOk(result)) deps.logger.warn({ deploymentId, errors: result.errors }, 'finalize failed');
  });
}

async function materializeBundle(bundle: CanonicalBundle): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rntme-deploy-'));
  for (const [relPath, value] of Object.entries(bundle.files)) {
    const path = join(dir, relPath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value));
  }
  return dir;
}

function defaultLoadComposed(dir: string): ResultLike<ComposedProjectInput> {
  const result = loadComposedBlueprint(dir);
  if (!result.ok) return result;
  return { ok: true, value: toDeployCoreInput(result.value) };
}

function toDeployCoreInput(value: {
  readonly project: {
    readonly name: string;
    readonly services: readonly string[];
    readonly routes?: ComposedProjectInput['routes'];
    readonly middleware?: ComposedProjectInput['middleware'];
    readonly mounts?: ComposedProjectInput['mounts'];
  };
  readonly services: Record<string, { readonly kind: 'domain' | 'integration' }>;
}): ComposedProjectInput {
  return {
    name: value.project.name,
    services: Object.fromEntries(
      value.project.services.map((slug) => [slug, { slug, kind: value.services[slug]?.kind ?? 'domain' }]),
    ),
    ...(value.project.routes === undefined ? {} : { routes: value.project.routes }),
    ...(value.project.middleware === undefined ? {} : { middleware: value.project.middleware }),
    ...(value.project.mounts === undefined ? {} : { mounts: value.project.mounts }),
  };
}

function redactTarget(target: DeployTargetWithSecret): DeployTarget {
  const {
    apiTokenCiphertext: _ciphertext,
    apiTokenNonce: _nonce,
    apiTokenKeyVersion: _keyVersion,
    ...rest
  } = target;
  return { ...rest, apiTokenRedacted: '***' };
}

function errorSummary(errors: readonly { readonly code?: string; readonly message?: string }[]): string {
  return errors.map((error) => `${error.code ?? 'UNKNOWN'}: ${error.message ?? ''}`).join('; ');
}
