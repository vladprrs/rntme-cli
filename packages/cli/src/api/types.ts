import { z } from 'zod';

export const ProjectSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectVersionSummarySchema = z.object({
  projectName: z.string(),
  services: z.array(z.string()),
  routes: z.object({
    ui: z.record(z.string(), z.string()),
    http: z.record(z.string(), z.string()),
  }),
  middleware: z.record(z.string(), z.unknown()),
  mounts: z.array(z.unknown()),
});
export type ProjectVersionSummary = z.infer<typeof ProjectVersionSummarySchema>;

export const ProjectVersionSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  projectId: z.string(),
  seq: z.number().int().positive(),
  bundleDigest: z.string(),
  bundleBlobKey: z.string(),
  bundleSizeBytes: z.number().int().nonnegative(),
  summary: ProjectVersionSummarySchema,
  uploadedByAccountId: z.string(),
  createdAt: z.string(),
});
export type ProjectVersion = z.infer<typeof ProjectVersionSchema>;

export const ApiTokenInfoSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  accountId: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiTokenInfo = z.infer<typeof ApiTokenInfoSchema>;

export const CreateProjectRequestSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const CreateTokenRequestSchema = z.object({
  name: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.iso.datetime().nullable().optional(),
});
export type CreateTokenRequest = z.infer<typeof CreateTokenRequestSchema>;

export const ProjectResponseSchema = z.object({ project: ProjectSchema });
export const ProjectsListResponseSchema = z.object({ projects: z.array(ProjectSchema) });
export const ProjectVersionResponseSchema = z.object({
  version: ProjectVersionSchema,
  __status: z.number().optional(),
});
export const ProjectVersionsListResponseSchema = z.object({
  versions: z.array(ProjectVersionSchema),
  nextCursor: z.number().nullable().optional(),
});
export const TokenCreatedResponseSchema = z.object({
  token: ApiTokenInfoSchema,
  plaintext: z.string(),
});
export const TokensListResponseSchema = z.object({ tokens: z.array(ApiTokenInfoSchema) });

export const AuthMeResponseSchema = z.object({
  account: z.object({
    id: z.string(),
    workosUserId: z.string(),
    displayName: z.string(),
    email: z.string().nullable(),
  }),
  org: z.object({
    id: z.string(),
    workosOrgId: z.string(),
    slug: z.string(),
  }),
  role: z.enum(['admin', 'member']),
  scopes: z.array(z.string()),
  tokenId: z.string().nullable().optional(),
});
