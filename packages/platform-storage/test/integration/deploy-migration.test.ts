import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { integrationContainersAvailable } from './docker-available.js';
import { startPostgres, stopPostgres, type PgHandles } from './harness.js';

const shouldRun = integrationContainersAvailable();
const d = shouldRun ? describe : describe.skip;

d('deploy migrations', () => {
  let h: PgHandles;

  beforeAll(async () => {
    h = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    if (h) await stopPostgres(h);
  });

  it('creates deploy tables, enum, RLS policies, and key constraints', async () => {
    const tables = await h.pool.query<{ tablename: string; rowsecurity: boolean }>(`
      SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname IN ('deploy_target', 'deployment', 'deployment_log_line')
      ORDER BY c.relname
    `);

    expect(tables.rows).toEqual([
      { tablename: 'deploy_target', rowsecurity: true },
      { tablename: 'deployment', rowsecurity: true },
      { tablename: 'deployment_log_line', rowsecurity: true },
    ]);

    const enumValues = await h.pool.query<{ enumlabel: string }>(`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'deployment_status'
      ORDER BY e.enumsortorder
    `);
    expect(enumValues.rows.map((row) => row.enumlabel)).toEqual([
      'queued',
      'running',
      'succeeded',
      'succeeded_with_warnings',
      'failed',
      'failed_orphaned',
    ]);

    const policies = await h.pool.query<{ tablename: string; policyname: string; cmd: string }>(`
      SELECT tablename, policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('deploy_target', 'deployment', 'deployment_log_line')
      ORDER BY tablename, policyname
    `);
    expect(policies.rows).toEqual([
      { tablename: 'deploy_target', policyname: 'tenant_insert', cmd: 'INSERT' },
      { tablename: 'deploy_target', policyname: 'tenant_isolation', cmd: 'ALL' },
      { tablename: 'deployment', policyname: 'tenant_insert', cmd: 'INSERT' },
      { tablename: 'deployment', policyname: 'tenant_isolation', cmd: 'ALL' },
      { tablename: 'deployment_log_line', policyname: 'tenant_insert', cmd: 'INSERT' },
      { tablename: 'deployment_log_line', policyname: 'tenant_isolation', cmd: 'ALL' },
    ]);

    const defaultIndex = await h.pool.query<{ indexdef: string }>(`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'deploy_target'
        AND indexname = 'one_default_per_org'
    `);
    expect(defaultIndex.rows).toHaveLength(1);
    expect(defaultIndex.rows[0]?.indexdef).toContain('WHERE is_default');

    const terminalCheck = await h.pool.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'deployment'::regclass
        AND conname = 'terminal_means_finished'
        AND contype = 'c'
    `);
    expect(terminalCheck.rows).toHaveLength(1);
  });
});
