import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { publishVersion } from '../../../src/use-cases/publish-version.js';
import { FakeStore } from '../../../src/testing/fakes.js';
import { SeededIds } from '../../../src/ids.js';
import { isOk } from '../../../src/types/result.js';
import { canonicalize, sha256Hex } from '../../../src/validation/canonical-json.js';
import { blobKey } from '../../../src/blob/store.js';
import { minimalValidBundle } from '../../fixtures/bundles/minimal-valid.js';

/**
 * Errata §3.6: per-file digests are computed over canonical-json, so the
 * uploaded bytes MUST be canonical-json too. A consumer fetching
 * `sha256/<digest>.json` and rehashing must get the same digest back.
 *
 * The minimal-valid bundle deliberately uses insertion-ordered keys that
 * differ from canonical (alphabetical) ordering — e.g. the manifest has
 * `{ rntmeVersion, service, surface, studio }` but canonical order is
 * `{ rntmeVersion, service, studio, surface }`. So `JSON.stringify(body)`
 * bytes will re-hash to a value that doesn't match the stored digest
 * unless `publishVersion` uploads canonical bytes.
 */
describe('publishVersion (canonical-json upload)', () => {
  it('uploads canonical-json bytes that re-hash to each per-file digest', async () => {
    const store = new FakeStore();
    const ids = new SeededIds(['v-1']);
    const org = await store.seedOrg({ slug: 'o', workosOrganizationId: 'org_1', displayName: 'O' });
    const acct = await store.seedAccount({ workosUserId: 'u1', displayName: 'U', email: null });
    const proj = await store.projects.create({ id: 'p1', orgId: org.id, slug: 'pr', displayName: 'P' });
    if (!isOk(proj)) throw new Error('seed: project');
    const svc = await store.services.create({
      id: 's1',
      orgId: org.id,
      projectId: proj.value.id,
      slug: 'sv',
      displayName: 'S',
    });
    if (!isOk(svc)) throw new Error('seed: service');

    const r = await publishVersion(
      { repos: { artifacts: store.artifacts, services: store.services }, blob: store.blob, ids },
      {
        orgId: org.id,
        serviceId: svc.value.id,
        accountId: acct.id,
        tokenId: null,
        bundle: minimalValidBundle,
      },
    );
    expect(isOk(r)).toBe(true);

    for (const name of ['manifest', 'pdm', 'qsm', 'graphIr', 'bindings', 'ui', 'seed'] as const) {
      const body = (minimalValidBundle as Record<string, unknown>)[name];
      const expected = sha256Hex(canonicalize(body));
      const stored = store.uploads.get(blobKey(expected));
      expect(stored, `stored bytes for ${name} (digest ${expected})`).toBeDefined();
      const actualHash = createHash('sha256').update(stored!).digest('hex');
      expect(actualHash, `re-hash of stored bytes for ${name}`).toBe(expected);
    }
  });
});
