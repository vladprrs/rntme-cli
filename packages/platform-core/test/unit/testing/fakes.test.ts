import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';

describe('FakeStore', () => {
  it('round-trips a project create/list', async () => {
    const s = new FakeStore();
    const seed = await s.seedOrg({ slug: 'o1', workosOrganizationId: 'org_1', displayName: 'o' });
    const created = await s.projects.create({ id: 'p1', orgId: seed.id, slug: 'proj', displayName: 'P' });
    expect(isOk(created)).toBe(true);
    const list = await s.projects.list(seed.id, { includeArchived: false });
    expect(isOk(list) && list.value).toHaveLength(1);
  });

  it('publish is idempotent by bundleDigest', async () => {
    const s = new FakeStore();
    const org = await s.seedOrg({ slug: 'o1', workosOrganizationId: 'org_1', displayName: 'o' });
    const proj = await s.projects.create({ id: 'p1', orgId: org.id, slug: 'proj', displayName: 'P' });
    if (!isOk(proj)) throw new Error('seed');
    const svc = await s.services.create({
      id: 's1',
      orgId: org.id,
      projectId: proj.value.id,
      slug: 'svc',
      displayName: 'S',
    });
    if (!isOk(svc)) throw new Error('seed');
    const account = await s.seedAccount({ workosUserId: 'u1', displayName: 'U', email: null });
    const row = {
      id: 'v1',
      orgId: org.id,
      serviceId: svc.value.id,
      bundleDigest: 'a'.repeat(64),
      previousVersionId: null,
      manifestDigest: 'a'.repeat(64),
      pdmDigest: 'a'.repeat(64),
      qsmDigest: 'a'.repeat(64),
      graphIrDigest: 'a'.repeat(64),
      bindingsDigest: 'a'.repeat(64),
      uiDigest: 'a'.repeat(64),
      seedDigest: 'a'.repeat(64),
      validationSnapshot: {},
      publishedByAccountId: account.id,
      publishedByTokenId: null,
      message: null,
    };
    const r1 = await s.artifacts.publish({
      serviceId: svc.value.id,
      expectedPreviousSeq: undefined,
      row,
      outboxPayload: {},
      auditActorAccountId: account.id,
      auditActorTokenId: null,
      moveTags: [],
    });
    const r2 = await s.artifacts.publish({
      serviceId: svc.value.id,
      expectedPreviousSeq: undefined,
      row: { ...row, id: 'v2' },
      outboxPayload: {},
      auditActorAccountId: account.id,
      auditActorTokenId: null,
      moveTags: [],
    });
    expect(isOk(r1) && isOk(r2)).toBe(true);
    if (isOk(r1) && isOk(r2)) expect(r1.value.id).toBe(r2.value.id); // idempotent
  });
});
