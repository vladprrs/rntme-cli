import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import type { DeployTargetWithSecret, SecretCipher } from '@rntme-cli/platform-core';
import type { RenderedDokployResource } from '@rntme-cli/deploy-dokploy';
import { createDokployClientFactory } from '../../../src/deploy/dokploy-client-factory.js';

describe('createDokployClientFactory', () => {
  it('decrypts the target token and sends it as x-api-key on client calls', async () => {
    type FetchInit = Parameters<typeof globalThis.fetch>[1];
    const calls: { url: string; init: FetchInit }[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).includes('/api/project.all')) {
        return jsonResponse([{ projectId: 'project-1', name: 'staging-project', environments: [{ environmentId: 'env-1', name: 'production', applications: [{ applicationId: 'app-1', name: 'edge' }] }] }]);
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

  it('configures files, ports, domains, deploy, and start for rendered resources', async () => {
    type FetchInit = Parameters<typeof globalThis.fetch>[1];
    const calls: { url: string; init: FetchInit }[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).includes('/api/application.one')) {
        return jsonResponse({
          applicationId: 'app-1',
          name: 'edge',
          dockerImage: 'nginx',
          mounts: [],
          ports: [],
          domains: [],
        });
      }
      return jsonResponse({});
    });
    const cipher: SecretCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => 'plain-token'),
    };

    const client = createDokployClientFactory(cipher, fetcher as typeof globalThis.fetch)(target());
    await client.deployApplication('app-1', edgeResource());

    expect(calls.map((call) => call.url)).toEqual([
      'https://dokploy.example.com/api/application.one?applicationId=app-1',
      'https://dokploy.example.com/api/mounts.create',
      'https://dokploy.example.com/api/port.create',
      'https://dokploy.example.com/api/domain.create',
      'https://dokploy.example.com/api/application.deploy',
      'https://dokploy.example.com/api/application.start',
    ]);
    expect(body(calls[1])).toMatchObject({
      serviceId: 'app-1',
      serviceType: 'application',
      type: 'file',
      mountPath: '/etc/nginx/nginx.conf',
      content: 'server { listen 8080; }',
    });
    expect(body(calls[2])).toMatchObject({
      applicationId: 'app-1',
      protocol: 'tcp',
      publishMode: 'ingress',
      publishedPort: 8080,
      targetPort: 8080,
    });
    expect(body(calls[3])).toMatchObject({
      applicationId: 'app-1',
      host: 'notes.example.test',
      https: true,
      path: '/',
      port: 8080,
      certificateType: 'letsencrypt',
      domainType: 'application',
    });
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
    publicBaseUrl: 'https://notes.example.test',
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

function body(call: { init: Parameters<typeof globalThis.fetch>[1] }): unknown {
  const raw = call.init?.body;
  if (typeof raw !== 'string') return undefined;
  return JSON.parse(raw);
}

function edgeResource(): RenderedDokployResource {
  return {
    logicalId: 'edge',
    kind: 'application',
    workloadKind: 'edge-gateway',
    workloadSlug: 'edge',
    name: 'edge',
    image: 'nginx',
    env: [],
    labels: { 'rntme.workload': 'edge' },
    files: { '/etc/nginx/nginx.conf': 'server { listen 8080; }' },
    ports: [{ containerPort: 8080, protocol: 'http' }],
    ingress: {
      publicBaseUrl: 'https://notes.example.test',
      containerPort: 8080,
      healthPath: '/health',
      routes: [{ routeId: 'ui:/', path: '/', url: 'https://notes.example.test/' }],
    },
  };
}
