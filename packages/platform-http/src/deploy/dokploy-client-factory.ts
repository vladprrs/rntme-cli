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
    const request = async <T>(path: string, body: unknown): Promise<T> => {
      const response = await httpFetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': token,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`Dokploy request failed: ${response.status} ${await response.text()}`);
      }
      return (await response.json()) as T;
    };

    return {
      ensureProject: async (ref: DokployProjectRef) =>
        request<{ projectId: string }>('/api/v1/projects/ensure', ref),
      findApplicationByName: async (projectId: string, name: string) => {
        const result = await request<{ application: DokployApplication | null }>(
          '/api/v1/applications/find',
          { projectId, name },
        );
        return result.application;
      },
      createApplication: async (projectId: string, resource: RenderedDokployResource) => {
        const result = await request<{ application: DokployApplication }>(
          '/api/v1/applications/create',
          { projectId, resource },
        );
        return result.application;
      },
      updateApplication: async (applicationId: string, resource: RenderedDokployResource) => {
        const result = await request<{ application: DokployApplication }>(
          '/api/v1/applications/update',
          { applicationId, resource },
        );
        return result.application;
      },
    };
  };
}

export function normalizeDokployBaseUrl(input: string): string {
  const trimmed = input.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}
