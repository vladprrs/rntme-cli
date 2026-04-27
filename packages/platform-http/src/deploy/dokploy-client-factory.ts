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

type DokployApiMount = {
  mountId: string;
  mountPath: string;
  filePath?: string | null;
  content?: string | null;
  type?: string;
};

type DokployApiPort = {
  portId: string;
  targetPort: number;
  publishedPort: number;
  protocol?: 'tcp' | 'udp';
  publishMode?: 'ingress' | 'host';
};

type DokployApiDomain = {
  domainId: string;
  host: string;
  path?: string | null;
  port?: number | null;
};

type DokployApiApplication = DokployApiApplicationSummary & {
  dockerImage?: string;
  env?: string;
  mounts?: readonly DokployApiMount[];
  ports?: readonly DokployApiPort[];
  domains?: readonly DokployApiDomain[];
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
        let project =
          ref.mode === 'create'
            ? projects.find((p) => p.name === ref.projectName)
            : projects.find((p) => p.projectId === ref.projectId);
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
          sourceType: 'docker',
          dockerImage: resource.image,
          env: resource.env?.map((e) => `${e.name}=${e.value}`).join('\n') || '',
        });
        await saveDockerProvider(request, app.applicationId, resource.image);
        return toDokployApplication(app);
      },
      updateApplication: async (applicationId: string, resource: RenderedDokployResource) => {
        const app = await request<DokployApiApplication>('POST', '/api/application.update', {
          applicationId,
          name: resource.name,
          appName: resource.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 63),
          description: `Managed by rntme-cli`,
          sourceType: 'docker',
          dockerImage: resource.image,
          env: resource.env?.map((e) => `${e.name}=${e.value}`).join('\n') || '',
        });
        await saveDockerProvider(request, applicationId, resource.image);
        return toDokployApplication(app);
      },
      deployApplication: async (applicationId: string, resource: RenderedDokployResource) => {
        const latest = await request<DokployApiApplication>('GET', '/api/application.one', { applicationId });
        await configureFiles(request, applicationId, latest, resource.files);
        await configurePorts(request, applicationId, latest, resource.ports);
        await configureIngress(request, applicationId, latest, resource.ingress);
        await request<unknown>('POST', '/api/application.deploy', {
          applicationId,
          title: `Deploy ${resource.name}`,
          description: 'Managed by rntme-cli',
        });
        await request<unknown>('POST', '/api/application.start', { applicationId });
      },
    };
  };
}

async function saveDockerProvider(
  request: <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>,
  applicationId: string,
  dockerImage: string,
): Promise<void> {
  await request<unknown>('POST', '/api/application.saveDockerProvider', {
    applicationId,
    dockerImage,
    password: null,
    registryUrl: null,
    username: null,
  });
}

async function configureFiles(
  request: <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>,
  applicationId: string,
  application: DokployApiApplication,
  files: RenderedDokployResource['files'],
): Promise<void> {
  if (files === undefined) return;

  const mounts = application.mounts ?? await request<DokployApiMount[]>('GET', '/api/mounts.listByServiceId', {
    serviceId: applicationId,
    serviceType: 'application',
  });

  for (const [mountPath, content] of sortedEntries(files)) {
    const existing = mounts.find((mount) => mount.mountPath === mountPath);
    const payload = {
      content,
      filePath: mountFilePath(mountPath),
      mountPath,
      serviceType: 'application' as const,
      type: 'file' as const,
    };

    if (existing) {
      await request<unknown>('POST', '/api/mounts.update', {
        ...payload,
        applicationId,
        mountId: existing.mountId,
      });
    } else {
      await request<unknown>('POST', '/api/mounts.create', {
        ...payload,
        serviceId: applicationId,
      });
    }
  }
}

async function configurePorts(
  request: <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>,
  applicationId: string,
  application: DokployApiApplication,
  ports: RenderedDokployResource['ports'],
): Promise<void> {
  if (ports === undefined) return;

  for (const port of ports) {
    const existing = application.ports?.find((current) => current.targetPort === port.containerPort);
    const payload = {
      applicationId,
      protocol: 'tcp' as const,
      publishMode: 'ingress' as const,
      publishedPort: port.containerPort,
      targetPort: port.containerPort,
    };

    if (existing) {
      await request<unknown>('POST', '/api/port.update', {
        ...payload,
        portId: existing.portId,
      });
    } else {
      await request<unknown>('POST', '/api/port.create', payload);
    }
  }
}

async function configureIngress(
  request: <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>,
  applicationId: string,
  application: DokployApiApplication,
  ingress: RenderedDokployResource['ingress'],
): Promise<void> {
  if (ingress === undefined) return;

  const url = new URL(ingress.publicBaseUrl);
  const domainPath = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '') || '/';
  const existing = application.domains?.find((domain) => domain.host === url.host && (domain.path ?? '/') === domainPath);
  const payload = {
    applicationId,
    certificateType: 'letsencrypt' as const,
    domainType: 'application' as const,
    host: url.host,
    https: url.protocol === 'https:',
    path: domainPath,
    port: ingress.containerPort,
    stripPath: false,
  };

  if (existing) {
    await request<unknown>('POST', '/api/domain.update', {
      ...payload,
      domainId: existing.domainId,
    });
  } else {
    await request<unknown>('POST', '/api/domain.create', payload);
  }
}

function toDokployApplication(details: DokployApiApplication): DokployApplication {
  return {
    id: details.applicationId,
    name: details.name,
    ...(details.dockerImage ? { image: details.dockerImage } : {}),
    env: parseEnvBlock(details.env),
  };
}

function mountFilePath(mountPath: string): string {
  const normalized = mountPath.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '_');
  return normalized === '' ? 'file' : normalized;
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

function sortedEntries(value: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
}
