import { describe, expect, it, vi } from 'vitest';
import type {
  DeployTarget,
  DeployTargetRepo,
  DeployTargetUpdateRow,
  SecretCipher,
} from '../../../src/index.js';
import { SeededIds } from '../../../src/ids.js';
import { err, isOk, ok, type PlatformError } from '../../../src/types/result.js';
import {
  createDeployTarget,
  deleteDeployTarget,
  rotateDeployTargetApiToken,
  setDefaultDeployTarget,
  updateDeployTarget,
} from '../../../src/use-cases/deploy-targets.js';

describe('deploy target use-cases', () => {
  it('encrypts apiToken on create before writing the repo row', async () => {
    const { deps, repo } = setup();

    const result = await createDeployTarget(deps, {
      orgId: '11111111-1111-4111-8111-111111111111',
      accountId: '22222222-2222-4222-8222-222222222222',
      tokenId: null,
      req: createRequest(),
    });

    expect(isOk(result)).toBe(true);
    expect(deps.cipher.encrypt).toHaveBeenCalledWith('dkp_secret');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        row: expect.objectContaining({
          id: 'target-1',
          apiTokenCiphertext: Buffer.from('ciphertext'),
          apiTokenNonce: Buffer.from('nonce'),
          apiTokenKeyVersion: 7,
        }),
      }),
    );
  });

  it('returns an error before touching the repo when encryption fails', async () => {
    const { deps, repo } = setup({
      cipher: { encrypt: vi.fn(() => { throw new Error('boom'); }), decrypt: vi.fn() },
    });

    const result = await createDeployTarget(deps, {
      orgId: '11111111-1111-4111-8111-111111111111',
      accountId: '22222222-2222-4222-8222-222222222222',
      tokenId: null,
      req: createRequest(),
    });

    expect(result.ok).toBe(false);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('propagates duplicate slug errors from the repo', async () => {
    const duplicate = err([
      { code: 'DEPLOY_TARGET_SLUG_TAKEN' as PlatformError['code'], message: 'slug taken' },
    ]);
    const { deps } = setup({ createResult: duplicate });

    const result = await createDeployTarget(deps, {
      orgId: '11111111-1111-4111-8111-111111111111',
      accountId: '22222222-2222-4222-8222-222222222222',
      tokenId: null,
      req: createRequest(),
    });

    expect(result).toBe(duplicate);
  });

  it('encrypts apiToken on rotate before delegating', async () => {
    const { deps, repo } = setup();

    const result = await rotateDeployTargetApiToken(deps, {
      orgId: '11111111-1111-4111-8111-111111111111',
      slug: 'dokploy-staging',
      accountId: '22222222-2222-4222-8222-222222222222',
      tokenId: 'tok-1',
      req: { apiToken: 'dkp_new' },
    });

    expect(isOk(result)).toBe(true);
    expect(deps.cipher.encrypt).toHaveBeenCalledWith('dkp_new');
    expect(repo.rotateApiToken).toHaveBeenCalledWith(
      expect.objectContaining({
        ciphertext: Buffer.from('ciphertext'),
        nonce: Buffer.from('nonce'),
        keyVersion: 7,
      }),
    );
  });

  it('passes update/setDefault/delete through to the repo', async () => {
    const { deps, repo } = setup();
    const base = {
      orgId: '11111111-1111-4111-8111-111111111111',
      slug: 'dokploy-staging',
      accountId: '22222222-2222-4222-8222-222222222222',
      tokenId: null,
    };
    const patch: DeployTargetUpdateRow = { displayName: 'Staging EU' };

    await updateDeployTarget(deps, { ...base, patch });
    await setDefaultDeployTarget(deps, base);
    await deleteDeployTarget(deps, base);

    expect(repo.update).toHaveBeenCalledWith(expect.objectContaining({ patch }));
    expect(repo.setDefault).toHaveBeenCalledWith(expect.objectContaining({ slug: base.slug }));
    expect(repo.delete).toHaveBeenCalledWith(expect.objectContaining({ slug: base.slug }));
  });
});

function setup(overrides: { cipher?: SecretCipher; createResult?: ReturnType<typeof ok<DeployTarget>> | ReturnType<typeof err<PlatformError>> } = {}) {
  const target = deployTarget();
  const repo: DeployTargetRepo = {
    create: vi.fn(async () => overrides.createResult ?? ok(target)),
    update: vi.fn(async () => ok(target)),
    rotateApiToken: vi.fn(async () => ok(target)),
    setDefault: vi.fn(async () => ok(target)),
    delete: vi.fn(async () => ok(undefined)),
    list: vi.fn(async () => ok([target])),
    getBySlug: vi.fn(async () => ok(target)),
    getDefault: vi.fn(async () => ok(target)),
    getWithSecretById: vi.fn(async () => ok(null)),
  };
  const cipher =
    overrides.cipher ??
    ({
      encrypt: vi.fn(() => ({
        ciphertext: Buffer.from('ciphertext'),
        nonce: Buffer.from('nonce'),
        keyVersion: 7,
      })),
      decrypt: vi.fn(),
    } satisfies SecretCipher);
  return {
    repo,
    deps: {
      repos: { deployTargets: repo },
      cipher,
      ids: new SeededIds(['target-1']),
    },
  };
}

function createRequest() {
  return {
    slug: 'dokploy-staging',
    displayName: 'Staging',
    kind: 'dokploy' as const,
    dokployUrl: 'https://dok.example.test',
    publicBaseUrl: 'https://notes.example.test',
    dokployProjectId: 'project-1',
    allowCreateProject: false,
    apiToken: 'dkp_secret',
    eventBus: { kind: 'kafka' as const, brokers: ['redpanda:9092'] },
    policyValues: {},
    isDefault: false,
  };
}

function deployTarget(): DeployTarget {
  return {
    id: 'target-1',
    orgId: '11111111-1111-4111-8111-111111111111',
    slug: 'dokploy-staging',
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
    isDefault: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}
