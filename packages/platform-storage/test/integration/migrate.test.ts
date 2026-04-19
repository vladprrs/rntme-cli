import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createPool, createDb } from '../../src/pg/pool.js';
import { runMigrations } from '../../src/migrate.js';
import { integrationContainersAvailable } from './docker-available.js';

describe.skipIf(!integrationContainersAvailable())('migrations', () => {
  let container: StartedPostgreSqlContainer | null = null;
  let connectionUri: string;

  beforeAll(async () => {
    const externalUrl = process.env.PLATFORM_TEST_DATABASE_URL;
    if (externalUrl) {
      connectionUri = externalUrl;
    } else {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      connectionUri = container.getConnectionUri();
    }
  }, 120_000);
  afterAll(async () => {
    if (container) await container.stop();
  });

  it('apply cleanly and create tables', async () => {
    const pool = createPool(connectionUri);
    const db = createDb(pool);
    await runMigrations(db, pool);
    await runMigrations(db, pool);
    const r = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
    const names = r.rows.map((x) => x.tablename).sort();
    expect(names).toContain('project');
    expect(names).toContain('service');
    expect(names).toContain('artifact_version');
    expect(names).toContain('api_token');
    await pool.end();
  });
});
