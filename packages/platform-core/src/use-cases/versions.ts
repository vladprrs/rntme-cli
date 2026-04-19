import { ok, err, isOk, type Result, type PlatformError } from '../types/result.js';
import type { ArtifactVersion } from '../schemas/entities.js';
import type { ArtifactRepo } from '../repos/artifact-repo.js';
import type { BlobStore } from '../blob/store.js';
import { blobKey } from '../blob/store.js';

type Deps = { repos: { artifacts: ArtifactRepo }; blob?: BlobStore };

export async function listVersions(
  deps: Deps,
  input: { serviceId: string; limit: number; cursor: number | undefined },
): Promise<Result<readonly ArtifactVersion[], PlatformError>> {
  return deps.repos.artifacts.listBySeq(input.serviceId, { limit: input.limit, cursor: input.cursor });
}

export async function getVersion(
  deps: Deps,
  input: { serviceId: string; seq: number },
): Promise<Result<ArtifactVersion, PlatformError>> {
  const r = await deps.repos.artifacts.getBySeq(input.serviceId, input.seq);
  if (!isOk(r)) return r;
  if (!r.value) return err([{ code: 'PLATFORM_TENANCY_SERVICE_NOT_FOUND', message: `seq ${input.seq}` }]);
  return ok(r.value);
}

export async function getBundle(
  deps: { repos: { artifacts: ArtifactRepo }; blob: BlobStore },
  input: { serviceId: string; seq: number },
): Promise<Result<Record<string, unknown>, PlatformError>> {
  const v = await getVersion(deps, input);
  if (!isOk(v)) return v;
  const out: Record<string, unknown> = {};
  const map: [string, string][] = [
    ['manifest', v.value.manifestDigest],
    ['pdm', v.value.pdmDigest],
    ['qsm', v.value.qsmDigest],
    ['graphIr', v.value.graphIrDigest],
    ['bindings', v.value.bindingsDigest],
    ['ui', v.value.uiDigest],
    ['seed', v.value.seedDigest],
  ];
  for (const [k, d] of map) {
    const body = await deps.blob.getJson(blobKey(d));
    if (!isOk(body)) return body;
    out[k] = body.value;
  }
  return ok(out);
}
