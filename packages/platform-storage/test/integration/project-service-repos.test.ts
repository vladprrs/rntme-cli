import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { isOk } from '@rntme-cli/platform-core';
import { startPostgres, stopPostgres, resetSchema } from './harness.js';
import { PgOrganizationRepo } from '../../src/repos/pg-org-repo.js';
import { PgProjectRepo } from '../../src/repos/pg-project-repo.js';
import { PgServiceRepo } from '../../src/repos/pg-service-repo.js';
import { withTransaction } from '../../src/pg/tx.js';
import { integrationContainersAvailable } from './docker-available.js';

describe.skipIf(!integrationContainersAvailable())('project + service repos with RLS', () => {
  let env: Awaited<ReturnType<typeof startPostgres>>;

  beforeAll(async () => {
    env = await startPostgres();
  }, 120_000);
  afterAll(async () => {
    if (!env) return;
    await stopPostgres(env);
  });
  beforeEach(async () => {
    await resetSchema(env.pool);
  });

  it('project.create inside tx honors org_id SET LOCAL', async () => {
    const orgs = new PgOrganizationRepo(env.pool);
    const o1 = await orgs.upsertFromWorkos({ workosOrganizationId: 'org_1', slug: 'o1', displayName: 'O' });
    if (!isOk(o1)) throw new Error('seed');

    await withTransaction(env.pool, o1.value.id, async (client) => {
      const repo = new PgProjectRepo(client);
      const r = await repo.create({
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        orgId: o1.value.id,
        slug: 'proj',
        displayName: 'P',
      });
      expect(isOk(r)).toBe(true);
    });

    const o2 = await orgs.upsertFromWorkos({ workosOrganizationId: 'org_2', slug: 'o2', displayName: 'O2' });
    if (!isOk(o2)) throw new Error('seed');
    await withTransaction(env.pool, o2.value.id, async (client) => {
      const repo = new PgProjectRepo(client);
      const r = await repo.list(o1.value.id, { includeArchived: false });
      expect(isOk(r) && r.value).toHaveLength(0);
    });
  });

  it('service.create + find round-trip', async () => {
    const orgs = new PgOrganizationRepo(env.pool);
    const o = await orgs.upsertFromWorkos({ workosOrganizationId: 'org_1', slug: 'o1', displayName: 'O' });
    if (!isOk(o)) throw new Error('seed');
    await withTransaction(env.pool, o.value.id, async (client) => {
      const projects = new PgProjectRepo(client);
      const services = new PgServiceRepo(client);
      const p = await projects.create({
        id: 'pppppppp-pppp-pppp-pppp-pppppppppppp',
        orgId: o.value.id,
        slug: 'pr',
        displayName: 'P',
      });
      if (!isOk(p)) throw new Error('seed');
      const s = await services.create({
        id: 'ssssssss-ssss-ssss-ssss-ssssssssssss',
        orgId: o.value.id,
        projectId: p.value.id,
        slug: 'sv',
        displayName: 'S',
      });
      expect(isOk(s)).toBe(true);
      const found = await services.findBySlug(p.value.id, 'sv');
      expect(isOk(found) && found.value!.slug).toBe('sv');
    });
  });
});
