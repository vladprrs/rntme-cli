import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';
import {
  createService,
  listServices,
  getServiceDetail,
  patchService,
  archiveService,
} from '../../../src/use-cases/services.js';
import { SeededIds } from '../../../src/ids.js';

async function setup() {
  const store = new FakeStore();
  const ids = new SeededIds(['svc-1', 'svc-2']);
  const org = await store.seedOrg({ slug: 'o1', workosOrganizationId: 'org_1', displayName: 'o' });
  const proj = await store.projects.create({ id: 'p1', orgId: org.id, slug: 'pr', displayName: 'P' });
  if (!isOk(proj)) throw new Error('seed');
  return { store, ids, orgId: org.id, projectId: proj.value.id };
}

describe('service use-cases', () => {
  it('createService + listServices', async () => {
    const { store, ids, orgId, projectId } = await setup();
    const c = await createService(
      { repos: { services: store.services }, ids },
      { orgId, projectId, slug: 's1', displayName: 'S' },
    );
    expect(isOk(c)).toBe(true);
    const l = await listServices({ repos: { services: store.services } }, { orgId, projectId });
    expect(isOk(l) && l.value).toHaveLength(1);
  });
  it('getServiceDetail returns 404 when missing', async () => {
    const { store, orgId } = await setup();
    const r = await getServiceDetail({ repos: { services: store.services } }, { orgId, id: 'x' });
    expect(isOk(r)).toBe(false);
  });
  it('patchService / archiveService', async () => {
    const { store, ids, orgId, projectId } = await setup();
    const c = await createService(
      { repos: { services: store.services }, ids },
      { orgId, projectId, slug: 's1', displayName: 'S' },
    );
    if (!isOk(c)) throw new Error('seed');
    const p = await patchService({ repos: { services: store.services } }, { orgId, id: c.value.id, displayName: 'S2' });
    expect(isOk(p) && p.value.displayName).toBe('S2');
    const a = await archiveService({ repos: { services: store.services } }, { orgId, id: c.value.id });
    expect(isOk(a)).toBe(true);
    if (isOk(a)) expect(a.value.archivedAt).not.toBeNull();
  });
});
