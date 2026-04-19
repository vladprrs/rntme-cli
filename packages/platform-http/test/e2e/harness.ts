import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
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
import { RandomIds } from '@rntme-cli/platform-core';
import { createApp, type AppDeps } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { parseEnv } from '../../src/config/env.js';
import { makeWorkosStub } from './workos-stub.js';

export type E2eEnv = {
  pg: StartedPostgreSqlContainer;
  minio: StartedTestContainer;
  app: ReturnType<typeof createApp>;
  deps: AppDeps;
  teardown(): Promise<void>;
};

export async function bootE2e(): Promise<E2eEnv> {
  const pg = await new PostgreSqlContainer('postgres:16-alpine').start();
  const minio = await new GenericContainer('minio/minio:latest')
    .withCommand(['server', '/data'])
    .withEnvironment({ MINIO_ROOT_USER: 'minio', MINIO_ROOT_PASSWORD: 'minio12345' })
    .withExposedPorts(9000)
    .start();
  const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
  const env = parseEnv({
    DATABASE_URL: pg.getConnectionUri(),
    RUSTFS_ENDPOINT: endpoint,
    RUSTFS_ACCESS_KEY_ID: 'minio',
    RUSTFS_SECRET_ACCESS_KEY: 'minio12345',
    RUSTFS_BUCKET: 'test-bucket',
    WORKOS_API_KEY: 'stub',
    WORKOS_CLIENT_ID: 'stub',
    WORKOS_WEBHOOK_SECRET: 'stub',
    WORKOS_REDIRECT_URI: 'http://localhost/callback',
    PLATFORM_BASE_URL: 'http://localhost',
    PLATFORM_SESSION_COOKIE_DOMAIN: 'localhost',
    PLATFORM_CORS_ORIGINS: '*',
  });
  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);
  await runMigrations(db, pool);
  const blob = new S3BlobStore({
    endpoint,
    bucket: env.RUSTFS_BUCKET,
    accessKeyId: env.RUSTFS_ACCESS_KEY_ID,
    secretAccessKey: env.RUSTFS_SECRET_ACCESS_KEY,
  });
  await blob.ensureBucket();
  const workos = makeWorkosStub();
  const logger = createLogger(env);
  const ids = new RandomIds();
  const deps: AppDeps = {
    env,
    logger,
    workos,
    cookiePassword: 'x'.repeat(32),
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
  };
  const app = createApp(deps);
  return {
    pg,
    minio,
    app,
    deps,
    teardown: async () => {
      await pool.end();
      await minio.stop();
      await pg.stop();
    },
  };
}
