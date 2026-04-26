import type {
  DokployApplication,
  DokployClient,
  DokployProjectRef,
  RenderedDokployResource,
} from '@rntme-cli/deploy-dokploy';
import type { DeployTargetWithSecret, SecretCipher } from '@rntme-cli/platform-core';

export type DokployClientFactory = (target: DeployTargetWithSecret) => DokployClient;

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
        const projects = await request<any[]>('GET', '/api/project.all');
        let project = projects.find((p) => p.name === (ref.mode === 'create' ? ref.projectName : ref.projectId));
        if (!project) {
          if (ref.mode !== 'create') throw new Error(`Project ${ref.projectId} not found`);
          project = await request<any>('POST', '/api/project.create', { name: ref.projectName });
        }
        let environment = project.environments?.find((e: any) => e.name === environmentName);
        if (!environment) {
          environment = await request<any>('POST', '/api/environment.create', {
            projectId: project.projectId,
            name: environmentName,
          });
        }
        return { environmentId: environment.environmentId };
      },
      findApplicationByName: async (environmentId: string, name: string) => {
        const projects = await request<any[]>('GET', '/api/project.all');
        for (const p of projects) {
          for (const e of p.environments || []) {
            if (e.environmentId === environmentId) {
              const app = e.applications?.find((a: any) => a.name === name);
              if (app) {
                const details = await request<any>('GET', '/api/application.one', { applicationId: app.applicationId });
                return {
                  id: details.applicationId,
                  name: details.name,
                  image: details.dockerImage,
                  env: details.env ? details.env.split('\n').filter(Boolean).map((l: string) => {
                    const [name, ...rest] = l.split('=');
                    return { name, value: rest.join('=') };
                  }) : [],
                };
              }
              return null;
            }
          }
        }
        return null;
      },
      createApplication: async (environmentId: string, resource: RenderedDokployResource) => {
        const app = await request<any>('POST', '/api/application.create', {
          environmentId,
          name: resource.name,
          appName: resource.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 63),
          description: `Managed by rntme-cli`,
        });
        await request<any>('POST', '/api/application.update', {
          applicationId: app.applicationId,
          buildType: 'dockerfile',
          dockerImage: resource.image,
          env: resource.env?.map((e) => `${e.name}=${e.value}`).join('\n') || '',
        });
        return { ...app, id: app.applicationId };
      },
      updateApplication: async (applicationId: string, resource: RenderedDokployResource) => {
        const app = await request<any>('POST', '/api/application.update', {
          applicationId,
          name: resource.name,
          appName: resource.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 63),
          description: `Managed by rntme-cli`,
          buildType: 'dockerfile',
          dockerImage: resource.image,
          env: resource.env?.map((e) => `${e.name}=${e.value}`).join('\n') || '',
        });
        return { ...app, id: app.applicationId };
      },
    };
  };
}

export function normalizeDokployBaseUrl(input: string): string {
  const trimmed = input.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}
