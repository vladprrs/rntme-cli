import { z } from 'zod';
import { SlugSchema, TokenNameSchema } from './primitives.js';
import { ScopeSchema } from './entities.js';

export const CreateProjectInputSchema = z.object({
  slug: SlugSchema,
  displayName: z.string().min(1).max(120),
});
export const PatchProjectInputSchema = z.object({ displayName: z.string().min(1).max(120) });

export const CreateTokenInputSchema = z.object({
  name: TokenNameSchema,
  scopes: z.array(ScopeSchema).min(1),
  expiresAt: z.iso.datetime().optional(),
});
