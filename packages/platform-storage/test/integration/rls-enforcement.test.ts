import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPostgres, stopPostgres, type PgHandles } from './harness.js';
import { integrationContainersAvailable } from './docker-available.js';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../src/pg/pool.js';

const shouldRun = integrationContainersAvailable();
const d = shouldRun ? describe : describe.skip;

d('RLS enforcement (errata §5 canonical invariants)', () => {
  let h: PgHandles;
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    h = await startPostgres();
    await h.pool.query(
      `INSERT INTO organization (id, workos_organization_id, slug, display_name) VALUES ($1,'wos_a','a','A'),($2,'wos_b','b','B')`,
      [orgA, orgB],
    );
    await h.pool.query(
      `INSERT INTO project (id, org_id, slug, display_name) VALUES ($1,$2,'p','P'),($3,$4,'p','P')`,
      [randomUUID(), orgA, randomUUID(), orgB],
    );
    await h.pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_owner') THEN
          CREATE ROLE platform_owner LOGIN PASSWORD 'platform_owner';
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO platform_owner;
      ALTER TABLE project OWNER TO platform_owner;
    `);
  }, 60_000);

  afterAll(async () => {
    if (h) await stopPostgres(h);
  });

  it('invariant 1: cross-org isolation is RLS-driven (no WHERE clause)', async () => {
    const client = await h.appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.org_id', $1, true)`, [orgA]);
      const r = await client.query(`SELECT org_id FROM project`);
      await client.query('COMMIT');
      expect(r.rows.every((x) => x.org_id === orgA)).toBe(true);
      expect(r.rows.length).toBe(1);
    } finally {
      client.release();
    }
  });

  it('invariant 2: missing SET LOCAL is fail-closed', async () => {
    const client = await h.appPool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(`SELECT org_id FROM project`);
      await client.query('COMMIT');
      expect(r.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });

  it('invariant 3: FORCE RLS applies to owner too (owner cannot bypass)', async () => {
    const ownerUrl = new URL(h.ownerUrl);
    ownerUrl.username = 'platform_owner';
    ownerUrl.password = 'platform_owner';
    const ownerPool = createPool(ownerUrl.toString(), { max: 1 });
    const client = await ownerPool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(`SELECT org_id FROM project`);
      await client.query('COMMIT');
      expect(r.rows.length).toBe(0);
    } finally {
      client.release();
      await ownerPool.end();
    }
  });
});
