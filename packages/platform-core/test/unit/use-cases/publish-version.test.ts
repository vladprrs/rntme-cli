import { describe, it, expect } from 'vitest';
import { FakeStore } from '../../../src/testing/fakes.js';
import { isOk } from '../../../src/types/result.js';
import { SeededIds } from '../../../src/ids.js';
import { publishVersion } from '../../../src/use-cases/publish-version.js';
import { minimalValidBundle } from '../../fixtures/bundles/minimal-valid.js';

async function setup() {
  const store = new FakeStore();
  const ids = new SeededIds(['v-1', 'v-2', 'v-3']);
  const org = await store.seedOrg({ slug: 'o', workosOrganizationId: 'org_1', displayName: 'O' });
  const acct = await store.seedAccount({ workosUserId: 'u1', displayName: 'U', email: null });
  const proj = await store.projects.create({ id: 'p1', orgId: org.id, slug: 'pr', displayName: 'P' });
  if (!isOk(proj)) throw new Error('seed');
  const svc = await store.services.create({ id: 's1', orgId: org.id, projectId: proj.value.id, slug: 'sv', displayName: 'S' });
  if (!isOk(svc)) throw new Error('seed');
  return { store, ids, orgId: org.id, serviceId: svc.value.id, accountId: acct.id };
}

describe('publishVersion', () => {
  it('rejects an invalid bundle with 422 stage=validation', async () => {
    const { store, ids, orgId, serviceId, accountId } = await setup();
    const brokenBundle = { ...minimalValidBundle, pdm: { entities: [{ name: '!!', fields: [] }] } };
    const r = await publishVersion(
      { repos: { artifacts: store.artifacts, services: store.services }, blob: store.blob, ids },
      { orgId, serviceId, accountId, tokenId: null, bundle: brokenBundle },
    );
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_VALIDATION_BUNDLE_FAILED');
  });

  it('publishes a valid bundle, seq=1', async () => {
    const { store, ids, orgId, serviceId, accountId } = await setup();
    const r = await publishVersion(
      { repos: { artifacts: store.artifacts, services: store.services }, blob: store.blob, ids },
      { orgId, serviceId, accountId, tokenId: null, bundle: minimalValidBundle },
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.seq).toBe(1);
  });

  it('idempotent: re-publishing same bundle returns same seq', async () => {
    const { store, ids, orgId, serviceId, accountId } = await setup();
    const r1 = await publishVersion(
      { repos: { artifacts: store.artifacts, services: store.services }, blob: store.blob, ids },
      { orgId, serviceId, accountId, tokenId: null, bundle: minimalValidBundle },
    );
    const r2 = await publishVersion(
      { repos: { artifacts: store.artifacts, services: store.services }, blob: store.blob, ids },
      { orgId, serviceId, accountId, tokenId: null, bundle: minimalValidBundle },
    );
    expect(isOk(r1) && isOk(r2)).toBe(true);
    if (isOk(r1) && isOk(r2)) expect(r1.value.seq).toBe(r2.value.seq);
  });

  it('detects previousVersionSeq mismatch -> PLATFORM_CONCURRENCY_VERSION_CONFLICT', async () => {
    const { store, ids, orgId, serviceId, accountId } = await setup();
    const r = await publishVersion(
      { repos: { artifacts: store.artifacts, services: store.services }, blob: store.blob, ids },
      { orgId, serviceId, accountId, tokenId: null, bundle: minimalValidBundle, previousVersionSeq: 999 },
    );
    expect(isOk(r)).toBe(false);
    if (!isOk(r)) expect(r.errors[0]!.code).toBe('PLATFORM_CONCURRENCY_VERSION_CONFLICT');
  });
});
