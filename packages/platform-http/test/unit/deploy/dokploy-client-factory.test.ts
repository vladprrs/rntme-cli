import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import type { RenderedDokployResource } from '@rntme-cli/deploy-dokploy';
import type { DeployTargetWithSecret, SecretCipher } from '@rntme-cli/platform-core';
import { createDokployClientFactory } from '../../../src/deploy/dokploy-client-factory.js';
import { createMockDokployApp } from '../../fixtures/mock-dokploy.js';

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

  it('finds an existing project by projectId even when the name differs', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/api/project.all')) {
        return jsonResponse([
          {
            projectId: 'project-1',
            name: 'rntme-demos',
            environments: [{ environmentId: 'env-1', name: 'default', applications: [] }],
          },
        ]);
      }
      return jsonResponse({});
    });
    const cipher: SecretCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => 'plain-token'),
    };

    const client = createDokployClientFactory(cipher, fetcher as typeof globalThis.fetch)(target());
    await expect(client.ensureEnvironment({ mode: 'existing', projectId: 'project-1' }, 'default')).resolves.toEqual({
      environmentId: 'env-1',
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('configures files, ingress, deploy, and start with Dokploy API payloads', async () => {
    type FetchInit = Parameters<typeof globalThis.fetch>[1];
    const calls: { url: string; body: unknown }[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).includes('/api/domain.byApplicationId')) return jsonResponse([]);
      if (String(url).includes('/api/mounts.allNamedByApplicationId')) return jsonResponse([]);
      return jsonResponse({});
    });
    const cipher: SecretCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => 'plain-token'),
    };

    const client = createDokployClientFactory(cipher, fetcher as typeof globalThis.fetch)(target());
    await client.configureApplication('app-1', renderedEdgeResource());
    await client.deployApplication('app-1');
    await client.startApplication('app-1');

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/api/application.update',
      '/api/application.saveEnvironment',
      '/api/application.saveDockerProvider',
      '/api/mounts.allNamedByApplicationId',
      '/api/mounts.create',
      '/api/domain.byApplicationId',
      '/api/domain.create',
      '/api/application.deploy',
      '/api/application.start',
    ]);
    expect(calls[2]?.body).toMatchObject({
      applicationId: 'app-1',
      dockerImage: 'nginx:1.27-alpine',
      username: '',
      password: '',
      registryUrl: '',
    });
    expect(calls[4]?.body).toMatchObject({
      type: 'file',
      serviceType: 'application',
      serviceId: 'app-1',
      mountPath: '/etc/nginx/nginx.conf',
      filePath: '/etc/nginx/nginx.conf',
      content: 'events {}',
    });
    expect(calls[6]?.body).toMatchObject({
      applicationId: 'app-1',
      host: 'notes.example.com',
      port: 8080,
      https: true,
      certificateType: 'letsencrypt',
    });
    expect(JSON.stringify(calls)).not.toContain('updateTraefikConfig');
  });

  it('configures generated artifact builds with Dokploy build-type fields', async () => {
    type FetchInit = Parameters<typeof globalThis.fetch>[1];
    const calls: { url: string; body: unknown }[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: FetchInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse({});
    });
    const cipher: SecretCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => 'plain-token'),
    };

    const client = createDokployClientFactory(cipher, fetcher as typeof globalThis.fetch)(target());
    await client.configureApplication('app-1', renderedDomainResource());

    const buildTypeCall = calls.find((call) => new URL(call.url).pathname === '/api/application.saveBuildType');
    expect(buildTypeCall?.body).toEqual({
      applicationId: 'app-1',
      buildType: 'dockerfile',
      dockerfile: 'Dockerfile',
      dockerContextPath: '.',
      dockerBuildStage: null,
      herokuVersion: null,
      railpackVersion: null,
    });
  });

  it('looks up created applications when Dokploy create returns an empty body', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/api/application.create')) return emptyResponse();
      if (String(url).includes('/api/project.all')) {
        return jsonResponse([
          {
            projectId: 'project-1',
            name: 'rntme-demos',
            environments: [
              {
                environmentId: 'env-1',
                name: 'default',
                applications: [{ applicationId: 'app-created', name: 'rntme-acme-notes-edge' }],
              },
            ],
          },
        ]);
      }
      if (String(url).includes('/api/application.one')) {
        return jsonResponse({ applicationId: 'app-created', name: 'rntme-acme-notes-edge', dockerImage: 'nginx' });
      }
      return jsonResponse({});
    });
    const cipher: SecretCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => 'plain-token'),
    };

    const client = createDokployClientFactory(cipher, fetcher as typeof globalThis.fetch)(target());
    await expect(client.createApplication('env-1', renderedEdgeResource())).resolves.toMatchObject({
      id: 'app-created',
      name: 'rntme-acme-notes-edge',
    });
  });

  it('runs the configure/deploy/start lifecycle against the e2e Dokploy mock', async () => {
    const mock = createMockDokployApp();
    const cipher: SecretCipher = {
      encrypt: vi.fn(),
      decrypt: vi.fn(() => 'plain-token'),
    };

    const client = createDokployClientFactory(cipher, async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
      return mock.app.request(url.href, init);
    })(target());

    const { environmentId } = await client.ensureEnvironment(
      { mode: 'existing', projectId: 'mock-project' },
      'production',
    );
    const created = await client.createApplication(environmentId, renderedEdgeResource());

    await expect(client.configureApplication(created.id, renderedEdgeResource())).resolves.toBeUndefined();
    await expect(client.deployApplication(created.id)).resolves.toBeUndefined();
    await expect(client.startApplication(created.id)).resolves.toBeUndefined();
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
    publicBaseUrl: 'https://notes.example.com',
    dokployProjectId: 'project-1',
    dokployProjectName: null,
    allowCreateProject: false,
    eventBus: { kind: 'kafka', brokers: ['redpanda:9092'] },
    modules: {},
    auth: {},
    policyValues: {},
    isDefault: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    apiTokenCiphertext: Buffer.from('ciphertext'),
    apiTokenNonce: Buffer.from('nonce'),
    apiTokenKeyVersion: 1,
  };
}

function renderedEdgeResource(): RenderedDokployResource {
  return {
    logicalId: 'edge',
    kind: 'application',
    workloadKind: 'edge-gateway',
    workloadSlug: 'edge',
    name: 'rntme-acme-notes-edge',
    image: 'nginx:1.27-alpine',
    env: [],
    labels: { 'rntme.workload': 'edge' },
    ports: [{ containerPort: 8080, protocol: 'http' }],
    ingress: {
      publicBaseUrl: 'https://notes.example.com',
      containerPort: 8080,
      healthPath: '/health',
      routes: [{ routeId: 'ui:/', path: '/', url: 'https://notes.example.com/' }],
    },
    files: { '/etc/nginx/nginx.conf': 'events {}' },
  };
}

function renderedDomainResource(): RenderedDokployResource {
  return {
    logicalId: 'app',
    kind: 'application',
    workloadKind: 'domain-service',
    workloadSlug: 'app',
    name: 'rntme-acme-notes-app',
    image: 'rntme-acme-notes-app:artifact',
    build: {
      kind: 'domain-service-artifact',
      baseImage: 'ghcr.io/vladprrs/rntme-runtime:1.0',
      image: 'rntme-acme-notes-app:artifact',
      artifact: { source: 'composed-project', serviceSlug: 'app' },
      context: { kind: 'generated', serviceSlug: 'app', files: ['Dockerfile'] },
    },
    env: [{ name: 'RNTME_PERSISTENCE_MODE', value: 'ephemeral', secret: false }],
    labels: { 'rntme.workload': 'app' },
  };
}

function emptyResponse(): Response {
  return new globalThis.Response('', { status: 200 });
}

function jsonResponse(body: unknown): Response {
  return new globalThis.Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
