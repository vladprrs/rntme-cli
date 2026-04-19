import { ok, err, isOk, type Result, type PlatformError } from '../types/result.js';
import type { ArtifactVersion } from '../schemas/entities.js';
import type { ServiceRepo } from '../repos/service-repo.js';
import type { ArtifactRepo, PublishInsertRow } from '../repos/artifact-repo.js';
import type { BlobStore } from '../blob/store.js';
import type { Ids } from '../ids.js';
import type { BundleInput } from '../schemas/requests.js';
import { validateBundle } from '../validation/bundle.js';
import { perFileDigest, bundleDigest, blobKey } from '../blob/store.js';

type Deps = {
  repos: { artifacts: ArtifactRepo; services: ServiceRepo };
  blob: BlobStore;
  ids: Ids;
};

export async function publishVersion(
  deps: Deps,
  input: {
    orgId: string;
    serviceId: string;
    accountId: string;
    tokenId: string | null;
    bundle: BundleInput;
    previousVersionSeq?: number;
    message?: string;
    moveTags?: readonly string[];
  },
): Promise<Result<ArtifactVersion, PlatformError>> {
  const svc = await deps.repos.services.findById(input.orgId, input.serviceId);
  if (!isOk(svc)) return svc;
  if (!svc.value) return err([{ code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: input.serviceId }]);
  if (svc.value.archivedAt) return err([{ code: 'PLATFORM_TENANCY_RESOURCE_ARCHIVED', message: input.serviceId }]);

  const v = await validateBundle(input.bundle);
  if (!isOk(v)) return v;

  const per = {
    manifest: perFileDigest(input.bundle.manifest),
    pdm: perFileDigest(input.bundle.pdm),
    qsm: perFileDigest(input.bundle.qsm),
    graphIr: perFileDigest(input.bundle.graphIr),
    bindings: perFileDigest(input.bundle.bindings),
    ui: perFileDigest(input.bundle.ui),
    seed: perFileDigest(input.bundle.seed),
  };
  const digest = bundleDigest(per);

  const existing = await deps.repos.artifacts.findByDigest(input.serviceId, digest);
  if (!isOk(existing)) return existing;
  if (existing.value) return ok(existing.value);

  const uploads: [keyof typeof per, unknown][] = [
    ['manifest', input.bundle.manifest],
    ['pdm', input.bundle.pdm],
    ['qsm', input.bundle.qsm],
    ['graphIr', input.bundle.graphIr],
    ['bindings', input.bundle.bindings],
    ['ui', input.bundle.ui],
    ['seed', input.bundle.seed],
  ];
  for (const [k, body] of uploads) {
    const key = blobKey(per[k]);
    const up = await deps.blob.putIfAbsent(key, Buffer.from(JSON.stringify(body)));
    if (!isOk(up)) return up;
  }

  const row: PublishInsertRow = {
    id: deps.ids.uuid(),
    orgId: input.orgId,
    serviceId: input.serviceId,
    bundleDigest: digest,
    previousVersionId: null,
    manifestDigest: per.manifest,
    pdmDigest: per.pdm,
    qsmDigest: per.qsm,
    graphIrDigest: per.graphIr,
    bindingsDigest: per.bindings,
    uiDigest: per.ui,
    seedDigest: per.seed,
    validationSnapshot: {
      rntmePdm: '0.0.0',
      rntmeQsm: '0.0.0',
      rntmeBindings: '0.0.0',
      rntmeGraphIr: '0.0.0',
      rntmeUi: '0.0.0',
      rntmeSeed: '0.0.0',
    },
    publishedByAccountId: input.accountId,
    publishedByTokenId: input.tokenId,
    message: input.message ?? null,
  };
  return deps.repos.artifacts.publish({
    serviceId: input.serviceId,
    expectedPreviousSeq: input.previousVersionSeq,
    row,
    outboxPayload: { serviceId: input.serviceId, bundleDigest: digest, orgId: input.orgId },
    auditActorAccountId: input.accountId,
    auditActorTokenId: input.tokenId,
    moveTags: (input.moveTags ?? []).map((name) => ({ name, updatedByAccountId: input.accountId })),
  });
}
