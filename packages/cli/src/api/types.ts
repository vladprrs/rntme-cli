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

export const ServiceSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  projectId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Service = z.infer<typeof ServiceSchema>;

export const ArtifactVersionSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  serviceId: z.string(),
  seq: z.number().int().positive(),
  bundleDigest: z.string(),
  previousVersionId: z.string().nullable(),
  manifestDigest: z.string(),
  pdmDigest: z.string(),
  qsmDigest: z.string(),
  graphIrDigest: z.string(),
  bindingsDigest: z.string(),
  uiDigest: z.string(),
  seedDigest: z.string(),
  validationSnapshot: z.record(z.string(), z.unknown()),
  publishedByAccountId: z.string(),
  publishedByTokenId: z.string().nullable(),
  publishedAt: z.string(),
  message: z.string().nullable(),
});
export type ArtifactVersion = z.infer<typeof ArtifactVersionSchema>;

export const ArtifactTagSchema = z.object({
  serviceId: z.string(),
  name: z.string(),
  versionId: z.string(),
  updatedAt: z.string(),
  updatedByAccountId: z.string(),
});
export type ArtifactTag = z.infer<typeof ArtifactTagSchema>;

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

export const CreateServiceRequestSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
});
export type CreateServiceRequest = z.infer<typeof CreateServiceRequestSchema>;

export const BundleInputSchema = z.object({
  manifest: z.record(z.string(), z.unknown()),
  pdm: z.record(z.string(), z.unknown()),
  qsm: z.record(z.string(), z.unknown()),
  graphIr: z.record(z.string(), z.unknown()),
  bindings: z.record(z.string(), z.unknown()),
  ui: z.record(z.string(), z.unknown()),
  seed: z.record(z.string(), z.unknown()),
});

export const PublishRequestSchema = z.object({
  bundle: BundleInputSchema,
  previousVersionSeq: z.number().int().positive().optional(),
  message: z.string().max(500).optional(),
  moveTags: z.array(z.string()).max(16).optional(),
});
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export const MoveTagRequestSchema = z.object({
  versionSeq: z.number().int().positive(),
});
export type MoveTagRequest = z.infer<typeof MoveTagRequestSchema>;

export const CreateTokenRequestSchema = z.object({
  name: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.iso.datetime().nullable().optional(),
});
export type CreateTokenRequest = z.infer<typeof CreateTokenRequestSchema>;

export const ProjectResponseSchema = z.object({ project: ProjectSchema });
export const ProjectsListResponseSchema = z.object({ projects: z.array(ProjectSchema) });
export const ServiceResponseSchema = z.object({ service: ServiceSchema });
export const ServicesListResponseSchema = z.object({ services: z.array(ServiceSchema) });
export const VersionResponseSchema = z.object({ version: ArtifactVersionSchema });
export const VersionsListResponseSchema = z.object({
  versions: z.array(ArtifactVersionSchema),
  nextCursor: z.string().nullable().optional(),
});
export const TagResponseSchema = z.object({ tag: ArtifactTagSchema });
export const TagsListResponseSchema = z.object({ tags: z.array(ArtifactTagSchema) });
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
    email: z.string(),
  }),
  org: z.object({
    id: z.string(),
    workosOrganizationId: z.string(),
    slug: z.string(),
  }),
  role: z.enum(['admin', 'member']),
  scopes: z.array(z.string()),
  tokenId: z.string().nullable().optional(),
});
