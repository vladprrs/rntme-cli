import { z } from 'zod';

export const RESERVED_SLUGS = [
  'api',
  'oauth',
  'health',
  'ready',
  'v1',
  'admin',
  'openapi',
  'webhooks',
] as const;

export const SlugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'slug must match [a-z0-9-]')
  .refine((s) => !RESERVED_SLUGS.includes(s as (typeof RESERVED_SLUGS)[number]), 'slug is reserved');

export const TagNameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_-]+$/);

export const TokenNameSchema = z.string().min(1).max(80);

export const UuidSchema = z.string().uuid();
export const WorkosIdSchema = z.string().min(3);
