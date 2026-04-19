import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';
import { SeededIds } from '../../../src/ids.js';
import { moveTag, deleteTag, listTags } from '../../../src/use-cases/tags.js';
import { publishVersion } from '../../../src/use-cases/publish-version.js';
import { minimalValidBundle } from '../../fixtures/bundles/minimal-valid.js';

async function seedWithOneVersion() {
  const store = new FakeStore();
  const ids = new SeededIds(['v1']);
  const org = await store.seedOrg({ slug: 'o', workosOrganizationId: 'org_1', displayName: 'O' });
  const acct = await store.seedAccount({ workosUserId: 'u1', displayName: 'U', email: null });
  const proj = await store.projects.create({ id: 'p1', orgId: org.id, slug: 'pr', displayName: 'P' });
  if (!isOk(proj)) throw new Error('seed');
  const svc = await store.services.create({ id: 's1', orgId: org.id, projectId: proj.value.id, slug: 'sv', displayName: 'S' });
  if (!isOk(svc)) throw new Error('seed');
  const v = await publishVersion(
    { repos: { artifacts: store.artifacts, services: store.services }, blob: store.blob, ids },
    { orgId: org.id, serviceId: svc.value.id, accountId: acct.id, tokenId: null, bundle: minimalValidBundle },
  );
  if (!isOk(v)) throw new Error('seed');
  return { store, serviceId: svc.value.id, accountId: acct.id, versionSeq: v.value.seq, versionId: v.value.id };
}

describe('tag use-cases', () => {
  it('moveTag creates a new pointer', async () => {
    const { store, serviceId, accountId, versionSeq } = await seedWithOneVersion();
    const r = await moveTag(
      { repos: { tags: store.tags, artifacts: store.artifacts } },
      { serviceId, name: 'stable', versionSeq, updatedByAccountId: accountId },
    );
    expect(isOk(r)).toBe(true);
  });
  it('listTags returns pointer', async () => {
    const { store, serviceId, accountId, versionSeq } = await seedWithOneVersion();
    await moveTag(
      { repos: { tags: store.tags, artifacts: store.artifacts } },
      { serviceId, name: 'preview', versionSeq, updatedByAccountId: accountId },
    );
    const r = await listTags({ repos: { tags: store.tags } }, { serviceId });
    expect(isOk(r) && r.value).toHaveLength(1);
  });
  it('deleteTag removes pointer', async () => {
    const { store, serviceId, accountId, versionSeq } = await seedWithOneVersion();
    await moveTag(
      { repos: { tags: store.tags, artifacts: store.artifacts } },
      { serviceId, name: 'x', versionSeq, updatedByAccountId: accountId },
    );
    const d = await deleteTag({ repos: { tags: store.tags } }, { serviceId, name: 'x', actorAccountId: accountId });
    expect(isOk(d)).toBe(true);
    const l = await listTags({ repos: { tags: store.tags } }, { serviceId });
    expect(isOk(l) && l.value).toHaveLength(0);
  });
});
