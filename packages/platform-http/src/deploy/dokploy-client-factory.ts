import type {
  DokployApplication,
  DokployClient,
  DokployProjectRef,
  RenderedDokployResource,
} from '@rntme-cli/deploy-dokploy';
import type { DeployTargetWithSecret, SecretCipher } from '@rntme-cli/platform-core';

export type DokployClientFactory = (target: DeployTargetWithSecret) => DokployClient;

type DokployApiApplicationSummary = {
  applicationId: string;
  name: string;
};

type DokployApiApplication = DokployApiApplicationSummary & {
  dockerImage?: string;
  env?: string;
};

type DokployApiEnvironment = {
  environmentId: string;
  name: string;
  applications?: readonly DokployApiApplicationSummary[];
};

type DokployApiProject = {
  projectId: string;
  name: string;
  environments?: readonly DokployApiEnvironment[];
};

export function createDokployClientFactory(
  cipher: SecretCipher,
  httpFetch: typeof globalThis.fetch = globalThis.fetch,
): DokployClientFactory {
  return (target) => {
    let token: string;
    try {
      token = cipher.decrypt({
        ciphertext: target.apiTokenCiphertext,
        nonce: target.apiTokenNonce,
        keyVersion: target.apiTokenKeyVersion,
      });
    } catch {
      throw new Error('DEPLOY_TARGET_TOKEN_DECRYPT_FAILED');
    }

    const baseUrl = normalizeDokployBaseUrl(target.dokployUrl);
    const request = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
      const url = method === 'GET' && body ? `${baseUrl}${path}?${new URLSearchParams(body as Record<string, string>)}` : `${baseUrl}${path}`;
      const response = await httpFetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-api-key': token,
        },
        ...(method === 'POST' && body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        throw new Error(`Dokploy request failed: ${response.status} ${await response.text()}`);
      }
      return (await response.json()) as T;
    };

    return {
      ensureEnvironment: async (ref: DokployProjectRef, environmentName: string) => {
        const projects = await request<DokployApiProject[]>('GET', '/api/project.all');
        let project = projects.find((p) => p.name === (ref.mode === 'create' ? ref.projectName : ref.projectId));
        if (!project) {
          if (ref.mode !== 'create') throw new Error(`Project ${ref.projectId} not found`);
          project = await request<DokployApiProject>('POST', '/api/project.create', { name: ref.projectName });
        }
        let environment = project.environments?.find((e) => e.name === environmentName);
        if (!environment) {
          environment = await request<DokployApiEnvironment>('POST', '/api/environment.create', {
            projectId: project.projectId,
            name: environmentName,
          });
        }
        return { environmentId: environment.environmentId };
      },
      findApplicationByName: async (environmentId: string, name: string) => {
        const projects = await request<DokployApiProject[]>('GET', '/api/project.all');
        for (const p of projects) {
          for (const e of p.environments || []) {
            if (e.environmentId === environmentId) {
              const app = e.applications?.find((a) => a.name === name);
              if (app) {
                const details = await request<DokployApiApplication>('GET', '/api/application.one', { applicationId: app.applicationId });
                return toDokployApplication(details);
              }
              return null;
            }
          }
        }
        return null;
      },
      createApplication: async (environmentId: string, resource: RenderedDokployResource) => {
        const app = await request<DokployApiApplication>('POST', '/api/application.create', {
          environmentId,
          name: resource.name,
          appName: resource.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 63),
          description: `Managed by rntme-cli`,
        });
        await request<DokployApiApplication>('POST', '/api/application.update', {
          applicationId: app.applicationId,
          buildType: 'dockerfile',
          dockerImage: resource.image,
          env: resource.env?.map((e) => `${e.name}=${e.value}`).join('\n') || '',
        });
        return toDokployApplication(app);
      },
      updateApplication: async (applicationId: string, resource: RenderedDokployResource) => {
        const app = await request<DokployApiApplication>('POST', '/api/application.update', {
          applicationId,
          name: resource.name,
          appName: resource.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 63),
          description: `Managed by rntme-cli`,
          buildType: 'dockerfile',
          dockerImage: resource.image,
          env: resource.env?.map((e) => `${e.name}=${e.value}`).join('\n') || '',
        });
        return toDokployApplication(app);
      },
    };
  };
}

function toDokployApplication(details: DokployApiApplication): DokployApplication {
  return {
    id: details.applicationId,
    name: details.name,
    ...(details.dockerImage ? { image: details.dockerImage } : {}),
    env: parseEnvBlock(details.env),
  };
}

function parseEnvBlock(input: string | undefined): NonNullable<DokployApplication['env']> {
  return input
    ? input.split('\n').filter(Boolean).map((line) => {
      const [name = '', ...rest] = line.split('=');
      return { name, value: rest.join('='), secret: false };
    })
    : [];
}

export function normalizeDokployBaseUrl(input: string): string {
  const trimmed = input.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}
