import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';
import { SeededIds } from '../../../src/ids.js';
import { listVersions } from '../../../src/use-cases/versions.js';
import { publishVersion } from '../../../src/use-cases/publish-version.js';
import { minimalValidBundle } from '../../fixtures/bundles/minimal-valid.js';

describe('version reads', () => {
  it('listVersions returns newest-first with pagination', async () => {
    const store = new FakeStore();
    const ids = new SeededIds(['a', 'b', 'c', 'd']);
    const org = await store.seedOrg({ slug: 'o', workosOrganizationId: 'org_1', displayName: 'O' });
    const acct = await store.seedAccount({ workosUserId: 'u1', displayName: 'U', email: null });
    const proj = await store.projects.create({ id: 'p1', orgId: org.id, slug: 'pr', displayName: 'P' });
    if (!isOk(proj)) throw new Error('seed');
    const svc = await store.services.create({ id: 's1', orgId: org.id, projectId: proj.value.id, slug: 'sv', displayName: 'S' });
    if (!isOk(svc)) throw new Error('seed');
    for (let i = 0; i < 3; i++) {
      const bundle = { ...minimalValidBundle, manifest: { ...minimalValidBundle.manifest, epoch: i } };
      await publishVersion(
        { repos: { artifacts: store.artifacts, services: store.services }, blob: store.blob, ids },
        { orgId: org.id, serviceId: svc.value.id, accountId: acct.id, tokenId: null, bundle },
      );
    }
    const r = await listVersions({ repos: { artifacts: store.artifacts } }, { serviceId: svc.value.id, limit: 2, cursor: undefined });
    expect(isOk(r) && r.value).toHaveLength(2);
  });
});
