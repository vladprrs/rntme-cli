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
  PgTokenRepo,
  S3BlobStore,
  AesGcmSecretCipher,
} from '@rntme-cli/platform-storage';
import { RandomIds } from '@rntme-cli/platform-core';
import { createApp, type AppDeps } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { parseEnv } from '../../src/config/env.js';
import { makeWorkosStub } from './workos-stub.js';

export type E2eEnv = {
  pg: StartedPostgreSqlContainer | null;
  minio: StartedTestContainer | null;
  ownerPool: ReturnType<typeof createPool>;
  app: ReturnType<typeof createApp>;
  deps: AppDeps;
  seedRepos: AppDeps['poolRepos'];
  teardown(): Promise<void>;
};

export type BootE2eOptions = {
  scheduleDeployment?: AppDeps['scheduleDeployment'];
};

export async function bootE2e(options: BootE2eOptions = {}): Promise<E2eEnv> {
  process.env.PLATFORM_CREATE_ROLES = '1';
  const externalDb = process.env['PLATFORM_TEST_DATABASE_URL'];
  const externalS3 = readExternalS3();
  const pg = externalDb ? null : await new PostgreSqlContainer('postgres:16-alpine').start();
  const minio = externalS3
    ? null
    : await new GenericContainer('minio/minio:latest')
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: 'minio', MINIO_ROOT_PASSWORD: 'minio12345' })
      .withExposedPorts(9000)
      .start();
  const endpoint = externalS3?.endpoint ?? `http://${minio!.getHost()}:${minio!.getMappedPort(9000)}`;
  const databaseUrl = externalDb ?? pg!.getConnectionUri();
  const env = parseEnv({
    DATABASE_URL: databaseUrl,
    RUSTFS_ENDPOINT: endpoint,
    RUSTFS_ACCESS_KEY_ID: externalS3?.accessKeyId ?? 'minio',
    RUSTFS_SECRET_ACCESS_KEY: externalS3?.secretAccessKey ?? 'minio12345',
    RUSTFS_BUCKET: externalS3?.bucket ?? 'test-bucket',
    WORKOS_API_KEY: 'stub',
    WORKOS_CLIENT_ID: 'stub',
    WORKOS_WEBHOOK_SECRET: 'stub',
    WORKOS_REDIRECT_URI: 'http://localhost/callback',
    PLATFORM_BASE_URL: 'http://localhost',
    PLATFORM_SESSION_COOKIE_DOMAIN: 'localhost',
    PLATFORM_CORS_ORIGINS: '*',
    PLATFORM_COOKIE_PASSWORD: 'x'.repeat(32),
    PLATFORM_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
  });

  // Run migrations as the owner, then grant the platform_app role rights and
  // hand control of the app pool to platform_app so e2e actually exercises RLS.
  const ownerPool = createPool(databaseUrl);
  const ownerDb = createDb(ownerPool);
  await runMigrations(ownerDb, ownerPool);
  await ownerPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO platform_app`);
  await ownerPool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO platform_app`);
  const parsed = new URL(databaseUrl);
  parsed.username = 'platform_app';
  parsed.password = 'platform_app';
  const pool = createPool(parsed.toString());

  const blob = new S3BlobStore({
    endpoint,
    bucket: env.RUSTFS_BUCKET,
    accessKeyId: env.RUSTFS_ACCESS_KEY_ID,
    secretAccessKey: env.RUSTFS_SECRET_ACCESS_KEY,
  });
  await blob.ensureBucket();
  const workos = makeWorkosStub();
  const logger = createLogger(env);
  const cipher = AesGcmSecretCipher.fromEnv(env);
  const ids = new RandomIds();
  const poolRepos = {
    organizations: new PgOrganizationRepo(pool),
    accounts: new PgAccountRepo(pool),
    memberships: new PgMembershipMirrorRepo(pool),
    workosEventLog: new PgWorkosEventLogRepo(pool),
    projects: new PgProjectRepo(pool),
    tokens: new PgTokenRepo(pool),
  };
  const seedRepos = {
    organizations: new PgOrganizationRepo(ownerPool),
    accounts: new PgAccountRepo(ownerPool),
    memberships: new PgMembershipMirrorRepo(ownerPool),
    workosEventLog: new PgWorkosEventLogRepo(ownerPool),
    projects: new PgProjectRepo(ownerPool),
    tokens: new PgTokenRepo(ownerPool),
  };
  const deps: AppDeps = {
    env,
    logger,
    workos,
    cookiePassword: 'x'.repeat(32),
    pool,
    blob,
    ids,
    cipher,
    enableBackgroundLoops: false,
    ...(options.scheduleDeployment ? { scheduleDeployment: options.scheduleDeployment } : {}),
    poolRepos,
  };
  const app = createApp(deps);
  return {
    pg,
    minio,
    ownerPool,
    app,
    deps,
    seedRepos,
    teardown: async () => {
      await pool.end();
      await ownerPool.end();
      await minio?.stop();
      await pg?.stop();
    },
  };
}

function readExternalS3(): {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
} | null {
  const endpoint = process.env['PLATFORM_TEST_S3_ENDPOINT'];
  const bucket = process.env['PLATFORM_TEST_S3_BUCKET'];
  const accessKeyId = process.env['PLATFORM_TEST_S3_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['PLATFORM_TEST_S3_SECRET_ACCESS_KEY'];
  if (!endpoint && !bucket && !accessKeyId && !secretAccessKey) return null;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Set PLATFORM_TEST_S3_ENDPOINT, PLATFORM_TEST_S3_BUCKET, PLATFORM_TEST_S3_ACCESS_KEY_ID, and PLATFORM_TEST_S3_SECRET_ACCESS_KEY together.',
    );
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}
