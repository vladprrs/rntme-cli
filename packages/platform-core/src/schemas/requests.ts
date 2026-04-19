import { z } from 'zod';
import { SlugSchema, TagNameSchema, TokenNameSchema } from './primitives.js';
import { ScopeSchema } from './entities.js';

export const BundleSchema = z.object({
  manifest: z.record(z.string(), z.unknown()),
  pdm: z.record(z.string(), z.unknown()),
  qsm: z.record(z.string(), z.unknown()),
  graphIr: z.record(z.string(), z.unknown()),
  bindings: z.record(z.string(), z.unknown()),
  ui: z.record(z.string(), z.unknown()),
  seed: z.record(z.string(), z.unknown()),
});
export type BundleInput = z.infer<typeof BundleSchema>;

export const PublishRequestSchema = z.object({
  bundle: BundleSchema,
  previousVersionSeq: z.number().int().positive().optional(),
  message: z.string().max(500).optional(),
  moveTags: z.array(TagNameSchema).max(16).optional(),
});
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export const CreateProjectInputSchema = z.object({
  slug: SlugSchema,
  displayName: z.string().min(1).max(120),
});
export const PatchProjectInputSchema = z.object({ displayName: z.string().min(1).max(120) });
export const CreateServiceInputSchema = z.object({ slug: SlugSchema, displayName: z.string().min(1).max(120) });
export const PatchServiceInputSchema = PatchProjectInputSchema;

export const MoveTagInputSchema = z.object({ versionSeq: z.number().int().positive() });

export const CreateTokenInputSchema = z.object({
  name: TokenNameSchema,
  scopes: z.array(ScopeSchema).min(1),
  expiresAt: z.iso.datetime().optional(),
});
export const ListVersionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().positive().optional(),
});
