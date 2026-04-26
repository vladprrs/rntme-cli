import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import type { DeployTargetWithSecret, SecretCipher } from '@rntme-cli/platform-core';
import { createDokployClientFactory } from '../../../src/deploy/dokploy-client-factory.js';

describe('createDokployClientFactory', () => {
  it('decrypts the target token and sends it as x-api-key on client calls', async () => {
    type FetchInit = Parameters<typeof globalThis.fetch>[1];
    const calls: { url: string; init: FetchInit }[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).includes('/api/project.all')) {
        return jsonResponse([{ projectId: 'project-1', name: 'project-1', environments: [{ environmentId: 'env-1', name: 'production', applications: [{ applicationId: 'app-1', name: 'edge' }] }] }]);
      }
      if (String(url).includes('/api/application.one')) {
        return jsonResponse({ applicationId: 'app-1', name: 'edge', dockerImage: 'nginx' });
      }
      return jsonResponse({});
    });
    const cipher: SecretCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => 'plain-token'),
    };

    const client = createDokployClientFactory(cipher, fetcher as typeof globalThis.fetch)(target());
    await client.ensureEnvironment({ mode: 'existing', projectId: 'project-1' }, 'production');
    await client.findApplicationByName('env-1', 'edge');

    expect(cipher.decrypt).toHaveBeenCalledOnce();
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        url: 'https://dokploy.example.com/api/project.all',
        init: expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'plain-token' }) }),
      }),
    );
    expect(calls[1]).toEqual(
      expect.objectContaining({
        url: 'https://dokploy.example.com/api/project.all',
        init: expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'plain-token' }) }),
      }),
    );
  });

  it('throws a redacted decrypt failure', () => {
    const cipher: SecretCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => {
        throw new Error('bad token secret');
      }),
    };

    expect(() => createDokployClientFactory(cipher, vi.fn() as typeof globalThis.fetch)(target())).toThrow(
      /DEPLOY_TARGET_TOKEN_DECRYPT_FAILED/,
    );
  });
});

function target(): DeployTargetWithSecret {
  return {
    id: 'target-1',
    orgId: '11111111-1111-4111-8111-111111111111',
    slug: 'staging',
    displayName: 'Staging',
    kind: 'dokploy',
    dokployUrl: 'https://dokploy.example.com/api/',
    dokployProjectId: 'project-1',
    dokployProjectName: null,
    allowCreateProject: false,
    eventBus: { kind: 'kafka', brokers: ['redpanda:9092'] },
    policyValues: {},
    isDefault: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    apiTokenCiphertext: Buffer.from('ciphertext'),
    apiTokenNonce: Buffer.from('nonce'),
    apiTokenKeyVersion: 1,
  };
}

function jsonResponse(body: unknown): Response {
  return new globalThis.Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
