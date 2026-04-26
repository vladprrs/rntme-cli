import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createPool, createDb, type Db } from '../../src/pg/pool.js';
import { runMigrations } from '../../src/migrate.js';
import type { Pool } from 'pg';

export type PgHandles = {
  /** Null when running against an external URL (PLATFORM_TEST_DATABASE_URL). */
  container: StartedPostgreSqlContainer | null;
  ownerUrl: string;
  appUrl: string;
  pool: Pool;
  appPool: Pool;
  db: Db;
};

export async function startPostgres(): Promise<PgHandles> {
  process.env.PLATFORM_CREATE_ROLES = '1';
  const externalUrl = process.env.PLATFORM_TEST_DATABASE_URL;
  let container: StartedPostgreSqlContainer | null = null;
  let ownerUrl: string;
  if (externalUrl) {
    ownerUrl = externalUrl;
  } else {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    ownerUrl = container.getConnectionUri();
  }
  const pool = createPool(ownerUrl);
  const db = createDb(pool);
  await runMigrations(db, pool);

  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO platform_app`);
  await pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO platform_app`);

  const parsed = new URL(ownerUrl);
  parsed.username = 'platform_app';
  parsed.password = 'platform_app';
  const appUrl = parsed.toString();
  const appPool = createPool(appUrl);

  return { container, ownerUrl, appUrl, pool, appPool, db };
}

export async function stopPostgres(h: PgHandles): Promise<void> {
  await h.appPool.end();
  await h.pool.end();
  if (h.container) await h.container.stop();
}

export async function resetSchema(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE audit_log, event_outbox, project_version, project, api_token, membership_mirror, workos_event_log, account, organization RESTART IDENTITY CASCADE;`,
  );
}
