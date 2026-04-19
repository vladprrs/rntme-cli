import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createPool, createDb, type Db } from '../../src/pg/pool.js';
import { runMigrations } from '../../src/migrate.js';
import type { Pool } from 'pg';

export async function startPostgres(): Promise<{
  container: StartedPostgreSqlContainer;
  pool: Pool;
  db: Db;
}> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const pool = createPool(container.getConnectionUri());
  const db = createDb(pool);
  await runMigrations(db, pool);
  return { container, pool, db };
}

export async function resetSchema(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE audit_log, event_outbox, artifact_tag, artifact_version, service, project, api_token, membership_mirror, workos_event_log, account, organization RESTART IDENTITY CASCADE;`,
  );
}
