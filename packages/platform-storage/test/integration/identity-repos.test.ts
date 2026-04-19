import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { isOk } from '@rntme-cli/platform-core';
import { startPostgres, resetSchema } from './harness.js';
import { PgOrganizationRepo } from '../../src/repos/pg-org-repo.js';
import { PgAccountRepo } from '../../src/repos/pg-account-repo.js';
import { PgMembershipMirrorRepo } from '../../src/repos/pg-membership-mirror-repo.js';
import { PgWorkosEventLogRepo } from '../../src/repos/pg-workos-event-log-repo.js';
import { integrationContainersAvailable } from './docker-available.js';

describe.skipIf(!integrationContainersAvailable())('identity repos', () => {
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

  it('upsertFromWorkos is idempotent', async () => {
    const repo = new PgOrganizationRepo(env.pool);
    const a = await repo.upsertFromWorkos({ workosOrganizationId: 'org_1', slug: 'o1', displayName: 'O1' });
    const b = await repo.upsertFromWorkos({ workosOrganizationId: 'org_1', slug: 'o1', displayName: 'O1b' });
    expect(isOk(a) && isOk(b)).toBe(true);
    if (isOk(a) && isOk(b)) expect(a.value.id).toBe(b.value.id);
  });

  it('findById returns org and account rows', async () => {
    const orgs = new PgOrganizationRepo(env.pool);
    const accts = new PgAccountRepo(env.pool);
    const o = await orgs.upsertFromWorkos({ workosOrganizationId: 'org_x', slug: 'ox', displayName: 'Ox' });
    const a = await accts.upsertFromWorkos({ workosUserId: 'user_x', email: null, displayName: 'Ux' });
    expect(isOk(o) && isOk(a)).toBe(true);
    if (!isOk(o) || !isOk(a)) return;
    const byOrg = await orgs.findById(o.value.id);
    const byAcct = await accts.findById(a.value.id);
    expect(isOk(byOrg) && isOk(byAcct)).toBe(true);
    if (isOk(byOrg) && isOk(byAcct)) {
      expect(byOrg.value?.slug).toBe('ox');
      expect(byAcct.value?.workosUserId).toBe('user_x');
    }
  });

  it('upsertFromWorkos preserves the original slug on update (slug is immutable)', async () => {
    await resetSchema(env.pool);
    const repo = new PgOrganizationRepo(env.pool);
    const first = await repo.upsertFromWorkos({ workosOrganizationId: 'w1', slug: 'original', displayName: 'One' });
    expect(first.ok).toBe(true);
    const second = await repo.upsertFromWorkos({ workosOrganizationId: 'w1', slug: 'renamed', displayName: 'Two' });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.slug).toBe('original');
      expect(second.value.displayName).toBe('Two');
    }
  });

  it('account + membership + workos log round-trip', async () => {
    const orgs = new PgOrganizationRepo(env.pool);
    const accts = new PgAccountRepo(env.pool);
    const mems = new PgMembershipMirrorRepo(env.pool);
    const log = new PgWorkosEventLogRepo(env.pool);
    const o = await orgs.upsertFromWorkos({ workosOrganizationId: 'org_a', slug: 'a', displayName: 'A' });
    const a = await accts.upsertFromWorkos({ workosUserId: 'user_a', email: null, displayName: 'U' });
    expect(isOk(o) && isOk(a)).toBe(true);
    if (isOk(o) && isOk(a)) {
      const m = await mems.upsert({ orgId: o.value.id, accountId: a.value.id, role: 'admin' });
      expect(isOk(m)).toBe(true);
    }
    const seen = await log.markProcessed('ev_1', 'user.created');
    expect(isOk(seen)).toBe(true);
    const again = await log.hasProcessed('ev_1');
    expect(isOk(again) && again.value).toBe(true);
  });
});
