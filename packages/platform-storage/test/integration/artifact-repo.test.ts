import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { isOk } from '@rntme-cli/platform-core';
import { startPostgres, resetSchema } from './harness.js';
import { PgOrganizationRepo } from '../../src/repos/pg-org-repo.js';
import { PgAccountRepo } from '../../src/repos/pg-account-repo.js';
import { PgProjectRepo } from '../../src/repos/pg-project-repo.js';
import { PgServiceRepo } from '../../src/repos/pg-service-repo.js';
import { PgArtifactRepo } from '../../src/repos/pg-artifact-repo.js';
import { withTransaction } from '../../src/pg/tx.js';
import { randomUUID } from 'node:crypto';
import { integrationContainersAvailable } from './docker-available.js';

describe.skipIf(!integrationContainersAvailable())('PgArtifactRepo', () => {
  let env: Awaited<ReturnType<typeof startPostgres>>;

  beforeAll(async () => {
    env = await startPostgres();
  }, 120_000);
  afterAll(async () => {
    if (!env) return;
    await env.pool.end();
    await env.container.stop();
  });
  beforeEach(async () => {
    await resetSchema(env.pool);
  });

  async function seed() {
    const orgs = new PgOrganizationRepo(env.pool);
    const accts = new PgAccountRepo(env.pool);
    const o = await orgs.upsertFromWorkos({ workosOrganizationId: 'org_1', slug: 'o1', displayName: 'O' });
    const a = await accts.upsertFromWorkos({ workosUserId: 'u_1', email: null, displayName: 'U' });
    if (!isOk(o) || !isOk(a)) throw new Error('seed');
    return withTransaction(env.pool, o.value.id, async (client) => {
      const projects = new PgProjectRepo(client);
      const services = new PgServiceRepo(client);
      const p = await projects.create({ id: randomUUID(), orgId: o.value.id, slug: 'pr', displayName: 'P' });
      if (!isOk(p)) throw new Error('seed');
      const s = await services.create({
        id: randomUUID(),
        orgId: o.value.id,
        projectId: p.value.id,
        slug: 'sv',
        displayName: 'S',
      });
      if (!isOk(s)) throw new Error('seed');
      return { orgId: o.value.id, accountId: a.value.id, serviceId: s.value.id };
    });
  }

  function baseRow(serviceId: string, orgId: string, accountId: string) {
    const digest = 'a'.repeat(64);
    return {
      id: randomUUID(),
      orgId,
      serviceId,
      bundleDigest: digest,
      previousVersionId: null,
      manifestDigest: digest,
      pdmDigest: digest,
      qsmDigest: digest,
      graphIrDigest: digest,
      bindingsDigest: digest,
      uiDigest: digest,
      seedDigest: digest,
      validationSnapshot: {},
      publishedByAccountId: accountId,
      publishedByTokenId: null,
      message: null,
    };
  }

  it('publish assigns seq=1, writes audit + outbox', async () => {
    const { orgId, accountId, serviceId } = await seed();
    const r = await withTransaction(env.pool, orgId, async (client) => {
      const repo = new PgArtifactRepo(client);
      return repo.publish({
        serviceId,
        expectedPreviousSeq: undefined,
        row: baseRow(serviceId, orgId, accountId),
        outboxPayload: { serviceId },
        auditActorAccountId: accountId,
        auditActorTokenId: null,
        moveTags: [],
      });
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.seq).toBe(1);

    const outbox = await withTransaction(env.pool, orgId, async (client) =>
      client.query('SELECT COUNT(*)::int AS c FROM event_outbox'),
    );
    expect(outbox.rows[0].c).toBe(1);
    const audit = await withTransaction(env.pool, orgId, async (client) =>
      client.query(`SELECT COUNT(*)::int AS c FROM audit_log WHERE action='version.published'`),
    );
    expect(audit.rows[0].c).toBe(1);
  });

  it('idempotency: same bundleDigest returns existing row', async () => {
    const { orgId, accountId, serviceId } = await seed();
    const row = baseRow(serviceId, orgId, accountId);
    const r1 = await withTransaction(env.pool, orgId, async (client) => {
      const repo = new PgArtifactRepo(client);
      return repo.publish({
        serviceId,
        expectedPreviousSeq: undefined,
        row,
        outboxPayload: {},
        auditActorAccountId: accountId,
        auditActorTokenId: null,
        moveTags: [],
      });
    });
    const r2 = await withTransaction(env.pool, orgId, async (client) => {
      const repo = new PgArtifactRepo(client);
      return repo.publish({
        serviceId,
        expectedPreviousSeq: undefined,
        row: { ...row, id: randomUUID() },
        outboxPayload: {},
        auditActorAccountId: accountId,
        auditActorTokenId: null,
        moveTags: [],
      });
    });
    expect(isOk(r1) && isOk(r2)).toBe(true);
    if (isOk(r1) && isOk(r2)) expect(r1.value.id).toBe(r2.value.id);
  });

  it('concurrency conflict when previousVersionSeq wrong', async () => {
    const { orgId, accountId, serviceId } = await seed();
    const r = await withTransaction(env.pool, orgId, async (client) => {
      const repo = new PgArtifactRepo(client);
      return repo.publish({
        serviceId,
        expectedPreviousSeq: 42,
        row: baseRow(serviceId, orgId, accountId),
        outboxPayload: {},
        auditActorAccountId: accountId,
        auditActorTokenId: null,
        moveTags: [],
      });
    });
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_CONCURRENCY_VERSION_CONFLICT');
  });

  it('enlists in the caller transaction and rolls back with it', async () => {
    const { orgId, accountId, serviceId } = await seed();
    const client = await env.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.org_id = $1`, [orgId]);
      const repo = new PgArtifactRepo(client);
      const r = await repo.publish({
        serviceId,
        expectedPreviousSeq: undefined,
        row: baseRow(serviceId, orgId, accountId),
        outboxPayload: { serviceId, bundleDigest: 'deadbeef', orgId },
        auditActorAccountId: accountId,
        auditActorTokenId: null,
        moveTags: [],
      });
      expect(isOk(r)).toBe(true);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const after = await env.pool.query(
      `SELECT count(*)::int AS n FROM artifact_version WHERE service_id=$1`,
      [serviceId],
    );
    expect(after.rows[0].n).toBe(0);
  });
});
