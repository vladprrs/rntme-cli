import { z } from 'zod';
import { SlugSchema, TokenNameSchema, UuidSchema, WorkosIdSchema } from './primitives.js';

export const RoleSchema = z.enum(['admin', 'member']);
export const ScopeSchema = z.enum([
  'project:read',
  'project:write',
  'version:publish',
  'member:read',
  'token:manage',
]);

export const OrganizationSchema = z.object({
  id: UuidSchema,
  workosOrganizationId: WorkosIdSchema,
  slug: SlugSchema,
  displayName: z.string().min(1).max(120),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const AccountSchema = z.object({
  id: UuidSchema,
  workosUserId: WorkosIdSchema,
  email: z.string().email().nullable(),
  displayName: z.string().min(1).max(120),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Account = z.infer<typeof AccountSchema>;

export const MembershipMirrorSchema = z.object({
  orgId: UuidSchema,
  accountId: UuidSchema,
  role: z.string().min(1),
  updatedAt: z.date(),
});
export type MembershipMirror = z.infer<typeof MembershipMirrorSchema>;

export const ProjectSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  slug: SlugSchema,
  displayName: z.string().min(1).max(120),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ApiTokenSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  accountId: UuidSchema,
  name: TokenNameSchema,
  tokenHash: z.instanceof(Uint8Array).refine((u) => u.length === 32, 'sha256 is 32 bytes'),
  prefix: z.string().length(12),
  scopes: z.array(ScopeSchema).min(1),
  lastUsedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.bigint(),
  orgId: UuidSchema,
  actorAccountId: UuidSchema,
  actorTokenId: UuidSchema.nullable(),
  action: z.string(),
  resourceKind: z.string(),
  resourceId: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
