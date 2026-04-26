import { z } from 'zod';
import { UuidSchema } from './primitives.js';

const Sha256Digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const SafeRelPath = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_./-]+$/, 'invalid characters in path')
  .refine((p) => !p.startsWith('/'), 'must be relative')
  .refine((p) => !p.split('/').includes('..'), 'must not contain ..')
  .refine((p) => p.endsWith('.json'), 'must end with .json');

export const ProjectVersionSummarySchema = z.object({
  projectName: z.string().min(1),
  services: z.array(z.string().min(1)),
  routes: z.object({
    ui: z.record(z.string(), z.string()),
    http: z.record(z.string(), z.string()),
  }),
  middleware: z.record(z.string(), z.unknown()),
  mounts: z.array(z.unknown()),
});
export type ProjectVersionSummary = z.infer<typeof ProjectVersionSummarySchema>;

export const ProjectVersionSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  projectId: UuidSchema,
  seq: z.number().int().positive(),
  bundleDigest: Sha256Digest,
  bundleBlobKey: z.string().min(1),
  bundleSizeBytes: z.number().int().nonnegative(),
  summary: ProjectVersionSummarySchema,
  uploadedByAccountId: UuidSchema,
  createdAt: z.date(),
});
export type ProjectVersion = z.infer<typeof ProjectVersionSchema>;

export const CanonicalBundleSchema = z.object({
  version: z.literal(1),
  files: z
    .record(SafeRelPath, z.unknown())
    .refine((files) => 'project.json' in files, 'bundle must contain project.json'),
});
export type CanonicalBundle = z.infer<typeof CanonicalBundleSchema>;

export const PublishProjectVersionRequestSchema = CanonicalBundleSchema;

export const ListProjectVersionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().positive().optional(),
});
