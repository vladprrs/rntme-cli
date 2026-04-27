import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { ComposedBlueprint } from '@rntme/blueprint';
import type { RenderedDokployPlan } from '@rntme-cli/deploy-dokploy';
import { ok, type DeploymentRepo, type DeployTargetRepo, type ProjectVersionRepo } from '@rntme-cli/platform-core';
import { runDeployment, type ExecutorDeps } from '../../../src/deploy/executor.js';

describe('runDeployment', () => {
  it('runs plan, render, apply, smoke verify and finalizes as succeeded', async () => {
    const { deps, deployments } = setup();

    await runDeployment('deployment-1', 'org-1', deps);

    expect(deployments.transition).toHaveBeenCalledWith('deployment-1', 'running', expect.any(Object));
    expect(deployments.setRenderedDigest).toHaveBeenCalledWith('deployment-1', 'sha256:rendered');
    expect(deployments.setApplyResult).toHaveBeenCalledWith('deployment-1', expect.objectContaining({ renderedPlanDigest: 'sha256:rendered' }));
    expect(deployments.finalize).toHaveBeenCalledWith('deployment-1', {
      status: 'succeeded',
      verificationReport: { checks: [], ok: true, partialOk: false },
    });
    expect(deployments.appendLog).toHaveBeenCalledWith(expect.objectContaining({ step: 'init' }));
    expect(deployments.appendLog).toHaveBeenCalledWith(expect.objectContaining({ step: 'plan' }));
    expect(deployments.appendLog).toHaveBeenCalledWith(expect.objectContaining({ step: 'render' }));
    expect(deployments.appendLog).toHaveBeenCalledWith(expect.objectContaining({ step: 'apply' }));
    expect(deployments.appendLog).toHaveBeenCalledWith(expect.objectContaining({ step: 'verify' }));
    expect(deployments.touchHeartbeat).toHaveBeenCalled();
  });

  it('finalizes blueprint revalidation failures', async () => {
    const { deps, deployments } = setup({
      loadComposed: () => ({ ok: false, errors: [{ code: 'BAD_BLUEPRINT', message: 'token=secret-value' }] }),
    });

    await runDeployment('deployment-1', 'org-1', deps);

    expect(deployments.finalize).toHaveBeenCalledWith('deployment-1', {
      status: 'failed',
      errorCode: 'DEPLOY_EXECUTOR_BLUEPRINT_REVALIDATION_FAILED',
      errorMessage: expect.not.stringContaining('secret-value'),
    });
  });

  it('maps smoke UI-only failures to succeeded_with_warnings', async () => {
    const { deps, deployments } = setup({
      verificationReport: { checks: [{ name: 'ui', url: 'https://ui', status: 500, latencyMs: 1, ok: false }], ok: false, partialOk: true },
    });

    await runDeployment('deployment-1', 'org-1', deps);

    expect(deployments.finalize).toHaveBeenCalledWith('deployment-1', {
      status: 'succeeded_with_warnings',
      verificationReport: {
        checks: [{ name: 'ui', url: 'https://ui', status: 500, latencyMs: 1, ok: false }],
        ok: false,
        partialOk: true,
      },
      warnings: ['smoke verification completed with warnings'],
    });
  });

  it('adapts composed blueprints and attaches runtime artifact files before apply', async () => {
    const applyPlan = vi.fn(async (plan: RenderedDokployPlan) =>
      ok({ target: { kind: 'dokploy' as const, projectId: 'project-1' }, deployment: plan.deployment, resources: [], urls: plan.urls, renderedPlanDigest: plan.digest, warnings: [], verificationHints: { healthUrl: 'https://app.example.test/health', publicRouteUrls: [] } }),
    );
    const renderPlan = vi.fn(() =>
      ok({
        target: { kind: 'dokploy' as const, endpoint: 'https://dokploy.example.test' },
        targetProject: { mode: 'existing' as const, projectId: 'project-1' },
        deployment: { orgSlug: 'acme', projectSlug: 'shop', environment: 'default' as const, mode: 'preview' as const },
        resources: [
          {
            logicalId: 'api',
            kind: 'application' as const,
            workloadKind: 'domain-service' as const,
            workloadSlug: 'api',
            name: 'rntme-acme-shop-api',
            image: 'rntme-acme-shop-api:artifact',
            build: {
              kind: 'domain-service-artifact' as const,
              baseImage: 'ghcr.io/vladprrs/rntme-runtime:1.0',
              image: 'rntme-acme-shop-api:artifact',
              artifact: { source: 'composed-project' as const, serviceSlug: 'api' },
              context: { kind: 'generated' as const, serviceSlug: 'api', files: [] },
            },
            env: [],
            labels: { 'rntme.workload': 'api' },
          },
        ],
        urls: { projectUrl: 'https://app.example.test', publicRoutes: [] },
        digest: 'sha256:rendered',
        warnings: [],
      }),
    );
    const planProject = vi.fn(() => ok({ project: { orgSlug: 'acme', projectSlug: 'shop', environment: 'default' as const, mode: 'preview' as const }, infrastructure: { eventBus: { kind: 'kafka' as const, mode: 'external' as const, brokers: ['redpanda:9092'] } }, workloads: [], edge: { routes: [], middleware: [] }, diagnostics: { warnings: [] } }));
    const { deps } = setup({
      applyPlan: applyPlan as never,
      bundleFiles: {
        'project.json': { name: 'shop', services: ['api'] },
        'services/api/ui/manifest.json': { version: '2.0', routes: {} },
      },
      loadComposed: () => ({ ok: true, value: composedBlueprint() }),
      planProject: planProject as never,
      renderPlan: renderPlan as never,
    });

    await runDeployment('deployment-1', 'org-1', deps);

    expect(planProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'shop',
        services: { api: { slug: 'api', kind: 'domain' } },
      }),
      expect.any(Object),
    );
    const appliedPlan = applyPlan.mock.calls[0]?.[0] as RenderedDokployPlan;
    expect(appliedPlan.digest).not.toBe('sha256:rendered');
    expect(appliedPlan.resources[0]).toMatchObject({
      image: 'ghcr.io/vladprrs/rntme-runtime:1.0',
      files: expect.objectContaining({
        '/srv/artifacts/manifest.json': expect.stringContaining('"service"'),
        '/srv/artifacts/pdm.json': expect.stringContaining('"entities"'),
        '/srv/artifacts/qsm.json': expect.stringContaining('"projections"'),
        '/srv/artifacts/bindings.json': expect.stringContaining('"bindings"'),
        '/srv/artifacts/shapes.json': expect.stringContaining('"NoteView"'),
        '/srv/artifacts/graphs/listNotes.json': expect.stringContaining('"listNotes"'),
        '/srv/artifacts/ui/manifest.json': expect.stringContaining('"2.0"'),
      }),
    });
    expect('build' in appliedPlan.resources[0]).toBe(false);
  });
});

function setup(
  overrides: Partial<Pick<ExecutorDeps, 'loadComposed'>> & {
    applyPlan?: ExecutorDeps['applyPlan'];
    bundleFiles?: Record<string, unknown>;
    planProject?: ExecutorDeps['planProject'];
    renderPlan?: ExecutorDeps['renderPlan'];
    verificationReport?: { checks: never[] | [{ name: string; url: string; status: number; latencyMs: number; ok: boolean }]; ok: boolean; partialOk: boolean };
  } = {},
) {
  const deployments = {
    create: vi.fn(),
    getById: vi.fn(async () =>
      ok({
        id: 'deployment-1',
        projectId: 'project-1',
        orgId: 'org-1',
        projectVersionId: 'version-1',
        targetId: 'target-1',
        status: 'running' as const,
        configOverrides: { publicBaseUrl: 'https://app.example.test' },
        renderedPlanDigest: null,
        applyResult: null,
        verificationReport: null,
        warnings: [],
        errorCode: null,
        errorMessage: null,
        startedByAccountId: 'account-1',
        queuedAt: new Date(),
        startedAt: new Date(),
        finishedAt: null,
        lastHeartbeatAt: new Date(),
      }),
    ),
    listByProject: vi.fn(),
    transition: vi.fn(async () => ok(undefined)),
    setRenderedDigest: vi.fn(async () => ok(undefined)),
    setApplyResult: vi.fn(async () => ok(undefined)),
    finalize: vi.fn(async () => ok(undefined)),
    touchHeartbeat: vi.fn(async () => ok(undefined)),
    appendLog: vi.fn(async () => ok(undefined)),
    readLogs: vi.fn(),
    findStaleRunning: vi.fn(),
  };
  const projectVersions = {
    create: vi.fn(),
    findByDigest: vi.fn(),
    getBySeq: vi.fn(),
    getById: vi.fn(async () =>
      ok({
        id: 'version-1',
        orgId: 'org-1',
        projectId: 'project-1',
        seq: 1,
        bundleDigest: 'sha256:' + 'a'.repeat(64),
        bundleBlobKey: 'bundle-key',
        bundleSizeBytes: 1,
        summary: { projectName: 'shop', services: [], routes: { ui: {}, http: {} }, middleware: {}, mounts: [] },
        uploadedByAccountId: 'account-1',
        createdAt: new Date(),
      }),
    ),
    listByProject: vi.fn(),
  };
  const deployTargets = {
    create: vi.fn(),
    update: vi.fn(),
    rotateApiToken: vi.fn(),
    setDefault: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getBySlug: vi.fn(),
    getDefault: vi.fn(),
    getWithSecretById: vi.fn(async () =>
      ok({
        id: 'target-1',
        orgId: 'org-1',
        slug: 'staging',
        displayName: 'Staging',
        kind: 'dokploy' as const,
        dokployUrl: 'https://dokploy.example.test',
        publicBaseUrl: 'https://app.example.test',
        dokployProjectId: 'project-1',
        dokployProjectName: null,
        allowCreateProject: false,
        eventBus: { kind: 'kafka' as const, brokers: ['redpanda:9092'] },
        policyValues: {},
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        apiTokenCiphertext: Buffer.from('cipher'),
        apiTokenNonce: Buffer.from('nonce'),
        apiTokenKeyVersion: 1,
      }),
    ),
  };
  const deps: ExecutorDeps = {
    blob: {
      putIfAbsent: vi.fn(),
      presignedGet: vi.fn(),
      getJson: vi.fn(),
      getRaw: vi.fn(async () =>
        ok(gzipSync(Buffer.from(JSON.stringify({ version: 1, files: overrides.bundleFiles ?? { 'project.json': { name: 'shop', services: [] } } })))),
      ),
    },
    withOrgTx: async (_orgId, fn) =>
      fn({
        deployments: deployments as unknown as DeploymentRepo,
        projectVersions: projectVersions as unknown as ProjectVersionRepo,
        deployTargets: deployTargets as unknown as DeployTargetRepo,
      }),
    orgSlugFor: vi.fn(async () => 'acme'),
    dokployClientFactory: vi.fn(() => ({} as never)),
    smoker: { verify: vi.fn(async () => overrides.verificationReport ?? { checks: [], ok: true, partialOk: false }) } as never,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    loadComposed:
      overrides.loadComposed ??
      (() => ({
        ok: true,
        value: {
          name: 'shop',
          services: { api: { slug: 'api', kind: 'domain' } },
          routes: { http: { '/api': 'api' } },
          middleware: {},
          mounts: [],
        },
      })),
    planProject: overrides.planProject ?? vi.fn(() => ok({ project: { orgSlug: 'acme', projectSlug: 'shop', environment: 'default' as const, mode: 'preview' as const }, infrastructure: { eventBus: { kind: 'kafka' as const, mode: 'external' as const, brokers: ['redpanda:9092'] } }, workloads: [], edge: { routes: [], middleware: [] }, diagnostics: { warnings: [] } })) as never,
    renderPlan: overrides.renderPlan ?? vi.fn(() => ok({ target: { kind: 'dokploy' as const, endpoint: 'https://dokploy.example.test' }, targetProject: { mode: 'existing' as const, projectId: 'project-1' }, deployment: { orgSlug: 'acme', projectSlug: 'shop', environment: 'default' as const, mode: 'preview' as const }, resources: [], urls: { projectUrl: 'https://app.example.test', publicRoutes: [] }, digest: 'sha256:rendered', warnings: [] })) as never,
    applyPlan: overrides.applyPlan ?? vi.fn(async () => ok({ target: { kind: 'dokploy' as const, projectId: 'project-1' }, deployment: { orgSlug: 'acme', projectSlug: 'shop', environment: 'default' as const, mode: 'preview' as const }, resources: [], urls: { projectUrl: 'https://app.example.test', publicRoutes: [] }, renderedPlanDigest: 'sha256:rendered', warnings: [], verificationHints: { healthUrl: 'https://app.example.test/health', publicRouteUrls: [] } })) as never,
    heartbeatMs: 10_000,
  };
  return { deps, deployments };
}

function composedBlueprint(): ComposedBlueprint {
  return {
    project: { name: 'shop', services: ['api'], routes: { ui: { '/': 'api' } } },
    pdm: { entities: {} } as never,
    routing: { httpBaseByService: {}, uiPathsByService: {} },
    bindingRegistry: {},
    services: {
      api: {
        slug: 'api',
        kind: 'domain',
        artifacts: { hasGraphs: true, hasBindings: true, hasUi: true, hasSeed: false, hasQsm: true },
        graphSpec: {
          version: '1.0-rc7',
          shapes: { NoteView: { fields: {} } },
          graphs: { listNotes: { id: 'listNotes', signature: { inputs: {}, output: { type: 'rowset<NoteView>', from: 'items' } }, nodes: [] } },
        },
        qsmValidated: { projections: {}, relations: {} } as never,
        bindings: { artifact: { version: '1.0', bindings: {} }, resolved: {} } as never,
        seed: null,
        compiledUi: null,
        eventTypes: [],
      },
    },
  };
}
