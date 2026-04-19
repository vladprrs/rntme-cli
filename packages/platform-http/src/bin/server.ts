import { serve } from '@hono/node-server';
import { RandomIds } from '@rntme-cli/platform-core';
import {
  createPool,
  createDb,
  runMigrations,
  PgOrganizationRepo,
  PgAccountRepo,
  PgMembershipMirrorRepo,
  PgWorkosEventLogRepo,
  PgProjectRepo,
  PgServiceRepo,
  PgArtifactRepo,
  PgTagRepo,
  PgTokenRepo,
  PgAuditRepo,
  PgOutboxRepo,
  S3BlobStore,
} from '@rntme-cli/platform-storage';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../logger.js';
import { createApp } from '../app.js';
import { createWorkos } from '../auth/workos-client.js';

const env = parseEnv(process.env);
const logger = createLogger(env);

async function main() {
  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);
  await runMigrations(db, pool);
  const blob = new S3BlobStore({
    endpoint: env.RUSTFS_ENDPOINT,
    bucket: env.RUSTFS_BUCKET,
    accessKeyId: env.RUSTFS_ACCESS_KEY_ID,
    secretAccessKey: env.RUSTFS_SECRET_ACCESS_KEY,
  });
  await blob.ensureBucket();
  const workos = createWorkos(env);
  const ids = new RandomIds();
  const cookiePassword = (env.PLATFORM_COOKIE_PASSWORD ?? '').padEnd(32, 'x').slice(0, 64);

  const app = createApp({
    env,
    logger,
    workos,
    cookiePassword,
    pool,
    blob,
    ids,
    repos: {
      organizations: new PgOrganizationRepo(pool),
      accounts: new PgAccountRepo(pool),
      memberships: new PgMembershipMirrorRepo(pool),
      workosEventLog: new PgWorkosEventLogRepo(pool),
      projects: new PgProjectRepo(pool),
      services: new PgServiceRepo(pool),
      artifacts: new PgArtifactRepo(pool),
      tags: new PgTagRepo(pool),
      tokens: new PgTokenRepo(pool),
      audit: new PgAuditRepo(pool),
      outbox: new PgOutboxRepo(pool),
    },
  });

  serve({ fetch: app.fetch, port: env.PORT });
  logger.info({ port: env.PORT, baseUrl: env.PLATFORM_BASE_URL }, 'platform-http listening');
}

main().catch((err) => {
  logger.error({ err }, 'boot failed');
  process.exit(1);
});
