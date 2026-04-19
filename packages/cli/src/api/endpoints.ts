import { apiCall, type ClientError } from './client.js';
import type { Result } from '../result.js';
import {
  ProjectResponseSchema,
  ProjectsListResponseSchema,
  ServiceResponseSchema,
  ServicesListResponseSchema,
  VersionResponseSchema,
  VersionsListResponseSchema,
  TagResponseSchema,
  TagsListResponseSchema,
  TokenCreatedResponseSchema,
  TokensListResponseSchema,
  AuthMeResponseSchema,
} from './types.js';
import type {
  CreateProjectRequest,
  CreateServiceRequest,
  CreateTokenRequest,
  PublishRequest,
  MoveTagRequest,
} from './types.js';

export type Ctx = { baseUrl: string; token: string | null; requestId?: string };

function enc(s: string): string {
  return encodeURIComponent(s);
}

async function deleteNoBody(
  path: string,
  c: Ctx,
): Promise<Result<void, ClientError>> {
  const { z } = await import('zod');
  const r = await apiCall({
    method: 'DELETE',
    path,
    responseSchema: z.object({}).passthrough(),
    ...c,
  });
  return r.ok ? { ok: true, value: undefined } : r;
}

export const endpoints = {
  auth: {
    me: (c: Ctx) =>
      apiCall({ method: 'GET', path: '/v1/auth/me', responseSchema: AuthMeResponseSchema, ...c }),
  },

  tokens: {
    create: (c: Ctx, org: string, body: CreateTokenRequest) =>
      apiCall({ method: 'POST', path: `/v1/orgs/${enc(org)}/tokens`, body, responseSchema: TokenCreatedResponseSchema, ...c }),
    list: (c: Ctx, org: string) =>
      apiCall({ method: 'GET', path: `/v1/orgs/${enc(org)}/tokens`, responseSchema: TokensListResponseSchema, ...c }),
    revoke: (c: Ctx, org: string, id: string) =>
      deleteNoBody(`/v1/orgs/${enc(org)}/tokens/${enc(id)}`, c),
  },

  projects: {
    create: (c: Ctx, org: string, body: CreateProjectRequest) =>
      apiCall({ method: 'POST', path: `/v1/orgs/${enc(org)}/projects`, body, responseSchema: ProjectResponseSchema, ...c }),
    list: (c: Ctx, org: string, opts?: { includeArchived?: boolean }) =>
      apiCall({
        method: 'GET',
        path: `/v1/orgs/${enc(org)}/projects${opts?.includeArchived ? '?includeArchived=1' : ''}`,
        responseSchema: ProjectsListResponseSchema,
        ...c,
      }),
    show: (c: Ctx, org: string, project: string) =>
      apiCall({ method: 'GET', path: `/v1/orgs/${enc(org)}/projects/${enc(project)}`,
                responseSchema: ProjectResponseSchema, ...c }),
  },

  services: {
    create: (c: Ctx, org: string, project: string, body: CreateServiceRequest) =>
      apiCall({ method: 'POST', path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/services`, body,
                responseSchema: ServiceResponseSchema, ...c }),
    list: (c: Ctx, org: string, project: string) =>
      apiCall({ method: 'GET', path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/services`,
                responseSchema: ServicesListResponseSchema, ...c }),
    show: (c: Ctx, org: string, project: string, service: string) =>
      apiCall({ method: 'GET', path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/services/${enc(service)}`,
                responseSchema: ServiceResponseSchema, ...c }),
  },

  versions: {
    list: (c: Ctx, org: string, project: string, service: string, opts?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (opts?.limit) qs.set('limit', String(opts.limit));
      if (opts?.cursor) qs.set('cursor', opts.cursor);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return apiCall({
        method: 'GET',
        path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/services/${enc(service)}/versions${suffix}`,
        responseSchema: VersionsListResponseSchema,
        ...c,
      });
    },
    show: (c: Ctx, org: string, project: string, service: string, seq: number) =>
      apiCall({ method: 'GET', path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/services/${enc(service)}/versions/${seq}`,
                responseSchema: VersionResponseSchema, ...c }),
    publish: (c: Ctx, org: string, project: string, service: string, body: PublishRequest) =>
      apiCall({ method: 'POST', path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/services/${enc(service)}/versions`,
                body, responseSchema: VersionResponseSchema, timeoutMs: 120_000, ...c }),
  },

  tags: {
    list: (c: Ctx, org: string, project: string, service: string) =>
      apiCall({ method: 'GET', path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/services/${enc(service)}/tags`,
                responseSchema: TagsListResponseSchema, ...c }),
    set: (c: Ctx, org: string, project: string, service: string, name: string, body: MoveTagRequest) =>
      apiCall({ method: 'PUT', path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/services/${enc(service)}/tags/${enc(name)}`,
                body, responseSchema: TagResponseSchema, ...c }),
    delete: (c: Ctx, org: string, project: string, service: string, name: string) =>
      deleteNoBody(`/v1/orgs/${enc(org)}/projects/${enc(project)}/services/${enc(service)}/tags/${enc(name)}`, c),
  },
};
