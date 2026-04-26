import { apiCall, type ClientError } from './client.js';
import type { Result } from '../result.js';
import {
  ProjectResponseSchema,
  ProjectsListResponseSchema,
  ProjectVersionResponseSchema,
  ProjectVersionsListResponseSchema,
  TokenCreatedResponseSchema,
  TokensListResponseSchema,
  AuthMeResponseSchema,
} from './types.js';
import type {
  CreateProjectRequest,
  CreateTokenRequest,
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

  projectVersions: {
    list: (c: Ctx, org: string, project: string, opts?: { limit?: number; cursor?: string }) => {
      const qs = new URLSearchParams();
      if (opts?.limit) qs.set('limit', String(opts.limit));
      if (opts?.cursor) qs.set('cursor', opts.cursor);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return apiCall({
        method: 'GET',
        path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/versions${suffix}`,
        responseSchema: ProjectVersionsListResponseSchema,
        ...c,
      });
    },
    show: (c: Ctx, org: string, project: string, seq: number) =>
      apiCall({
        method: 'GET',
        path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/versions/${seq}`,
        responseSchema: ProjectVersionResponseSchema,
        ...c,
      }),
    publishBundle: (c: Ctx, org: string, project: string, bytes: string) =>
      apiCall({
        method: 'POST',
        path: `/v1/orgs/${enc(org)}/projects/${enc(project)}/versions`,
        rawBody: bytes,
        contentType: 'application/rntme-project-bundle+json',
        responseSchema: ProjectVersionResponseSchema,
        timeoutMs: 120_000,
        ...c,
      }),
  },

};
