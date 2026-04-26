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
});
