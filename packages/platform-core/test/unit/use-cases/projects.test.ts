import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';
import {
  createProject,
  listProjects,
  getProject,
  patchProject,
  archiveProject,
} from '../../../src/use-cases/projects.js';
import { SeededIds } from '../../../src/ids.js';

async function setup() {
  const store = new FakeStore();
  const ids = new SeededIds(['id-1', 'id-2', 'id-3', 'id-4']);
  const org = await store.seedOrg({ slug: 'o1', workosOrganizationId: 'org_1', displayName: 'o' });
  return { store, ids, orgId: org.id };
}

describe('project use-cases', () => {
  it('createProject inserts and returns', async () => {
    const { store, ids, orgId } = await setup();
    const r = await createProject({ repos: { projects: store.projects }, ids }, { orgId, slug: 'proj', displayName: 'P' });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.slug).toBe('proj');
  });
  it('createProject returns PLATFORM_CONFLICT_SLUG_TAKEN on duplicate', async () => {
    const { store, ids, orgId } = await setup();
    await createProject({ repos: { projects: store.projects }, ids }, { orgId, slug: 'proj', displayName: 'P' });
    const r = await createProject({ repos: { projects: store.projects }, ids }, { orgId, slug: 'proj', displayName: 'P2' });
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_CONFLICT_SLUG_TAKEN');
  });
  it('listProjects excludes archived by default', async () => {
    const { store, ids, orgId } = await setup();
    const c = await createProject({ repos: { projects: store.projects }, ids }, { orgId, slug: 'a', displayName: 'A' });
    if (!isOk(c)) throw new Error('seed');
    await archiveProject({ repos: { projects: store.projects } }, { orgId, id: c.value.id });
    const r = await listProjects({ repos: { projects: store.projects } }, { orgId, includeArchived: false });
    expect(isOk(r) && r.value).toHaveLength(0);
  });
  it('getProject returns 404 code when missing', async () => {
    const { store, orgId } = await setup();
    const r = await getProject({ repos: { projects: store.projects } }, { orgId, id: 'missing' });
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_TENANCY_PROJECT_NOT_FOUND');
  });
  it('patchProject updates displayName', async () => {
    const { store, ids, orgId } = await setup();
    const c = await createProject({ repos: { projects: store.projects }, ids }, { orgId, slug: 'p1', displayName: 'old' });
    if (!isOk(c)) throw new Error('seed');
    const r = await patchProject({ repos: { projects: store.projects } }, { orgId, id: c.value.id, displayName: 'new' });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.displayName).toBe('new');
  });
});
