import { z } from 'zod';

export const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  RUSTFS_ENDPOINT: z.string().url(),
  RUSTFS_ACCESS_KEY_ID: z.string().min(1),
  RUSTFS_SECRET_ACCESS_KEY: z.string().min(1),
  RUSTFS_BUCKET: z.string().min(1),
  WORKOS_API_KEY: z.string().min(1),
  WORKOS_CLIENT_ID: z.string().min(1),
  WORKOS_WEBHOOK_SECRET: z.string().min(1),
  WORKOS_REDIRECT_URI: z.string().url(),
  PLATFORM_BASE_URL: z.string().url(),
  PLATFORM_SESSION_COOKIE_DOMAIN: z.string().min(1),
  PLATFORM_CORS_ORIGINS: z.string().default('https://*.rntme.com'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});
export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
  const r = EnvSchema.safeParse(source);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid environment: ${msg}`);
  }
  return r.data;
}
