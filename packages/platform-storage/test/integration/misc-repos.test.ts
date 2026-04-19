import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { isOk } from '@rntme-cli/platform-core';
import { startPostgres, resetSchema } from './harness.js';
import { PgOrganizationRepo } from '../../src/repos/pg-org-repo.js';
import { PgAccountRepo } from '../../src/repos/pg-account-repo.js';
import { PgTokenRepo } from '../../src/repos/pg-token-repo.js';
import { PgOutboxRepo } from '../../src/repos/pg-outbox-repo.js';
import { withTransaction } from '../../src/pg/tx.js';
import { randomUUID, createHash } from 'node:crypto';

const skipContainers = process.env['SKIP_TESTCONTAINERS'] === '1';

describe.skipIf(skipContainers)('misc repos', () => {
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

  it('token create / list by prefix / revoke', async () => {
    const orgs = new PgOrganizationRepo(env.pool);
    const accts = new PgAccountRepo(env.pool);
    const o = await orgs.upsertFromWorkos({ workosOrganizationId: 'org_1', slug: 'o1', displayName: 'O' });
    const a = await accts.upsertFromWorkos({ workosUserId: 'u', email: null, displayName: 'U' });
    if (!isOk(o) || !isOk(a)) throw new Error('seed');
    await withTransaction(env.pool, o.value.id, async (client) => {
      const repo = new PgTokenRepo(client);
      const plain = 'rntme_pat_' + 'a'.repeat(22);
      const hash = new Uint8Array(createHash('sha256').update(plain).digest());
      const t = await repo.create({
        id: randomUUID(),
        orgId: o.value.id,
        accountId: a.value.id,
        name: 'cli',
        tokenHash: hash,
        prefix: plain.slice(0, 12),
        scopes: ['project:read'],
        expiresAt: null,
      });
      expect(isOk(t)).toBe(true);
      if (isOk(t)) {
        const found = await repo.findByPrefix(plain.slice(0, 12));
        expect(isOk(found) && found.value!.id).toBe(t.value.id);
        const rev = await repo.revoke(o.value.id, t.value.id);
        expect(isOk(rev)).toBe(true);
        const after = await repo.findByPrefix(plain.slice(0, 12));
        expect(isOk(after) && after.value).toBeNull();
      }
    });
  });

  it('outbox pending returns only undelivered', async () => {
    const repo = new PgOutboxRepo(env.pool);
    const orgs = new PgOrganizationRepo(env.pool);
    const o = await orgs.upsertFromWorkos({ workosOrganizationId: 'org_1', slug: 'o1', displayName: 'O' });
    if (!isOk(o)) throw new Error('seed');
    await env.pool.query(`INSERT INTO event_outbox (org_id, event_type, payload) VALUES ($1,'x',$2)`, [o.value.id, {}]);
    await env.pool.query(`INSERT INTO event_outbox (org_id, event_type, payload, delivered_at) VALUES ($1,'x',$2, now())`, [
      o.value.id,
      {},
    ]);
    const r = await repo.pending(10);
    expect(isOk(r) && r.value).toHaveLength(1);
  });
});
