import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { startPostgres, stopPostgres, resetSchema, type PgHandles } from './harness.js';
import { integrationContainersAvailable } from './docker-available.js';
import { archiveOrgCascade, syncWorkosEvent, isOk } from '@rntme-cli/platform-core';
import {
  PgOrganizationRepo,
  PgProjectRepo,
  PgTokenRepo,
  PgAccountRepo,
  PgMembershipMirrorRepo,
  PgWorkosEventLogRepo,
} from '../../src/index.js';
import { withTransaction } from '../../src/pg/tx.js';

const d = integrationContainersAvailable() ? describe : describe.skip;

d('archiveOrgCascade (errata §3.3, §3.4)', () => {
  let h: PgHandles;
  beforeAll(async () => {
    h = await startPostgres();
  }, 60_000);
  afterAll(async () => {
    if (h) await stopPostgres(h);
  });

  it('archives org + projects and revokes tokens in one TX', async () => {
    await resetSchema(h.pool);
    const orgId = randomUUID();
    const accountId = randomUUID();
    const projectId = randomUUID();
    const tokenId = randomUUID();
    await h.pool.query(
      `INSERT INTO organization (id, workos_organization_id, slug, display_name) VALUES ($1,'w','s','S')`,
      [orgId],
    );
    await h.pool.query(`INSERT INTO account (id, workos_user_id, display_name) VALUES ($1,'u','U')`, [
      accountId,
    ]);
    await h.pool.query(`INSERT INTO project (id, org_id, slug, display_name) VALUES ($1,$2,'p','P')`, [
      projectId,
      orgId,
    ]);
    await h.pool.query(
      `INSERT INTO api_token (id, org_id, account_id, name, token_hash, prefix, scopes) VALUES ($1,$2,$3,'t',$4,'abcdefghijkl','{"project:read"}')`,
      [tokenId, orgId, accountId, randomBytes(32)],
    );

    await withTransaction(h.pool, orgId, async (client) => {
      const res = await archiveOrgCascade(
        {
          repos: {
            organizations: new PgOrganizationRepo(client),
            projects: new PgProjectRepo(client),
            tokens: new PgTokenRepo(client),
          },
        },
        { orgId },
      );
      expect(res.ok).toBe(true);
      if (isOk(res)) {
        expect(res.value.projectsArchived).toBe(1);
        expect(res.value.tokensRevoked).toBe(1);
      }
    });

    const r1 = await h.pool.query(`SELECT archived_at FROM organization WHERE id=$1`, [orgId]);
    expect(r1.rows[0].archived_at).not.toBeNull();
    const r2 = await h.pool.query(`SELECT archived_at FROM project WHERE id=$1`, [projectId]);
    expect(r2.rows[0].archived_at).not.toBeNull();
    const r3 = await h.pool.query(`SELECT revoked_at FROM api_token WHERE id=$1`, [tokenId]);
    expect(r3.rows[0].revoked_at).not.toBeNull();
  });

  it('double delivery of organization.deleted revokes tokens exactly once', async () => {
    await resetSchema(h.pool);
    const orgId = randomUUID();
    const accountId = randomUUID();
    const projectId = randomUUID();
    const tokenId = randomUUID();
    await h.pool.query(
      `INSERT INTO organization (id, workos_organization_id, slug, display_name) VALUES ($1,'w2','s2','S')`,
      [orgId],
    );
    await h.pool.query(`INSERT INTO account (id, workos_user_id, display_name) VALUES ($1,'u2','U')`, [
      accountId,
    ]);
    await h.pool.query(`INSERT INTO project (id, org_id, slug, display_name) VALUES ($1,$2,'p','P')`, [
      projectId,
      orgId,
    ]);
    await h.pool.query(
      `INSERT INTO api_token (id, org_id, account_id, name, token_hash, prefix, scopes) VALUES ($1,$2,$3,'t',$4,'abcdefghijkl','{"project:read"}')`,
      [tokenId, orgId, accountId, randomBytes(32)],
    );

    const ev = {
      id: 'evt_same',
      type: 'organization.deleted' as const,
      data: { id: 'w2' },
    };
    const deps = {
      repos: {
        organizations: new PgOrganizationRepo(h.pool),
        accounts: new PgAccountRepo(h.pool),
        memberships: new PgMembershipMirrorRepo(h.pool),
        projects: new PgProjectRepo(h.pool),
        tokens: new PgTokenRepo(h.pool),
        workosEventLog: new PgWorkosEventLogRepo(h.pool),
      },
      withOrgTx: <T>(orgIdInner: string, fn: (tx: PoolClient) => Promise<T>) =>
        withTransaction(h.pool, orgIdInner, fn),
      makeTxCascadeRepos: (tx: PoolClient) => ({
        organizations: new PgOrganizationRepo(tx),
        projects: new PgProjectRepo(tx),
        tokens: new PgTokenRepo(tx),
      }),
      claimWorkosEvent: async (
        tx: PoolClient,
        eventId: string,
        eventType: string,
      ): Promise<boolean> => {
        const r = await tx.query(
          `INSERT INTO workos_event_log (event_id, event_type) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
          [eventId, eventType],
        );
        return (r.rowCount ?? 0) > 0;
      },
    };
    const [r1, r2] = await Promise.all([syncWorkosEvent(deps, ev), syncWorkosEvent(deps, ev)]);
    expect(r1.ok && r2.ok).toBe(true);
    const logCount = await h.pool.query(
      `SELECT count(*)::int AS n FROM workos_event_log WHERE event_id=$1`,
      [ev.id],
    );
    expect(logCount.rows[0].n).toBe(1);
    const revoked = await h.pool.query(`SELECT revoked_at FROM api_token WHERE id=$1`, [tokenId]);
    expect(revoked.rows[0].revoked_at).not.toBeNull();
  });
});
