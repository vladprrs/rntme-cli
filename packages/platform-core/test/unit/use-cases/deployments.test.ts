import { describe, expect, it, vi } from 'vitest';
import type {
  DeployTarget,
  DeployTargetRepo,
  Deployment,
  DeploymentRepo,
  ProjectVersion,
  ProjectVersionRepo,
} from '../../../src/index.js';
import { SeededIds } from '../../../src/ids.js';
import { isOk, ok } from '../../../src/types/result.js';
import { startDeployment } from '../../../src/use-cases/deployments.js';

describe('deployment use-cases', () => {
  it('creates a queued deployment for a version and explicit target', async () => {
    const { deps, deployments } = setup();

    const result = await startDeployment(deps, input({ targetSlug: 'staging' }));

    expect(isOk(result)).toBe(true);
    expect(deployments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        row: expect.objectContaining({
          id: 'deployment-1',
          projectVersionId: 'version-1',
          targetId: 'target-1',
          configOverrides: {},
        }),
      }),
    );
  });

  it('returns target-not-specified when no targetSlug and no default target exists', async () => {
    const { deps } = setup({ defaultTarget: null });

    const result = await startDeployment(deps, input());

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.errors[0]?.code).toBe('DEPLOY_REQUEST_TARGET_NOT_SPECIFIED');
  });

  it('returns target-not-found when explicit target slug is not in the org', async () => {
    const { deps } = setup({ target: null });

    const result = await startDeployment(deps, input({ targetSlug: 'missing' }));

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.errors[0]?.code).toBe('DEPLOY_REQUEST_TARGET_NOT_FOUND');
  });

  it('returns version-not-found when version seq is missing', async () => {
    const { deps } = setup({ version: null });

    const result = await startDeployment(deps, input({ targetSlug: 'staging' }));

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.errors[0]?.code).toBe('DEPLOY_REQUEST_VERSION_NOT_FOUND');
  });

  it('treats a target from another org as not found', async () => {
    const { deps } = setup({ target: deployTarget({ orgId: '99999999-9999-4999-8999-999999999999' }) });

    const result = await startDeployment(deps, input({ targetSlug: 'staging' }));

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.errors[0]?.code).toBe('DEPLOY_REQUEST_TARGET_NOT_FOUND');
  });
});

function setup(overrides: { version?: ProjectVersion | null; target?: DeployTarget | null; defaultTarget?: DeployTarget | null } = {}) {
  const version = overrides.version === undefined ? projectVersion() : overrides.version;
  const target = overrides.target === undefined ? deployTarget() : overrides.target;
  const defaultTarget = overrides.defaultTarget === undefined ? deployTarget() : overrides.defaultTarget;
  const projectVersions: ProjectVersionRepo = {
    create: vi.fn(),
    findByDigest: vi.fn(),
    getBySeq: vi.fn(async () => ok(version)),
    getById: vi.fn(),
    listByProject: vi.fn(),
  };
  const deployTargets: DeployTargetRepo = {
    create: vi.fn(),
    update: vi.fn(),
    rotateApiToken: vi.fn(),
    setDefault: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getBySlug: vi.fn(async () => ok(target)),
    getDefault: vi.fn(async () => ok(defaultTarget)),
    getWithSecretById: vi.fn(),
  };
  const deployment = queuedDeployment();
  const deployments: DeploymentRepo = {
    create: vi.fn(async () => ok(deployment)),
    getById: vi.fn(),
    listByProject: vi.fn(),
    transition: vi.fn(),
    setRenderedDigest: vi.fn(),
    setApplyResult: vi.fn(),
    finalize: vi.fn(),
    touchHeartbeat: vi.fn(),
    appendLog: vi.fn(),
    readLogs: vi.fn(),
    findStaleRunning: vi.fn(),
  };
  return {
    deployments,
    deps: {
      repos: { projectVersions, deployTargets, deployments },
      ids: new SeededIds(['deployment-1']),
    },
  };
}

function input(req: { targetSlug?: string } = {}) {
  return {
    orgId: '11111111-1111-4111-8111-111111111111',
    projectId: '33333333-3333-4333-8333-333333333333',
    accountId: '22222222-2222-4222-8222-222222222222',
    tokenId: null,
    req: {
      projectVersionSeq: 1,
      targetSlug: req.targetSlug,
      configOverrides: {},
    },
  };
}

function projectVersion(): ProjectVersion {
  return {
    id: 'version-1',
    orgId: '11111111-1111-4111-8111-111111111111',
    projectId: '33333333-3333-4333-8333-333333333333',
    seq: 1,
    bundleDigest: 'sha256:' + 'a'.repeat(64),
    bundleBlobKey: 'projects/p/versions/sha256-a.json.gz',
    bundleSizeBytes: 123,
    summary: { projectName: 'shop', services: [], routes: { ui: {}, http: {} }, middleware: {}, mounts: [] },
    uploadedByAccountId: '22222222-2222-4222-8222-222222222222',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function deployTarget(overrides: Partial<DeployTarget> = {}): DeployTarget {
  return {
    id: 'target-1',
    orgId: '11111111-1111-4111-8111-111111111111',
    slug: 'staging',
    displayName: 'Staging',
    kind: 'dokploy',
    dokployUrl: 'https://dok.example.test',
    publicBaseUrl: 'https://notes.example.test',
    dokployProjectId: 'project-1',
    dokployProjectName: null,
    allowCreateProject: false,
    apiTokenRedacted: '***',
    eventBus: { kind: 'kafka', brokers: ['redpanda:9092'] },
    policyValues: {},
    isDefault: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function queuedDeployment(): Deployment {
  return {
    id: 'deployment-1',
    projectId: '33333333-3333-4333-8333-333333333333',
    orgId: '11111111-1111-4111-8111-111111111111',
    projectVersionId: 'version-1',
    targetId: 'target-1',
    status: 'queued',
    configOverrides: {},
    renderedPlanDigest: null,
    applyResult: null,
    verificationReport: null,
    warnings: [],
    errorCode: null,
    errorMessage: null,
    startedByAccountId: '22222222-2222-4222-8222-222222222222',
    queuedAt: new Date('2026-01-01T00:00:00Z'),
    startedAt: null,
    finishedAt: null,
    lastHeartbeatAt: null,
  };
}
