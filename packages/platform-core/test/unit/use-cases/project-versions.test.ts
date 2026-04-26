import { describe, expect, it, vi } from 'vitest';
import type {
  BlobStore,
  Ids,
  Project,
  ProjectRepo,
  ProjectVersion,
  ProjectVersionRepo,
} from '../../../src/index.js';
import { publishProjectVersion } from '../../../src/use-cases/project-versions.js';
import { ok } from '../../../src/types/result.js';

function makeFakeRepos() {
  const project: Project = {
    id: 'proj-1',
    orgId: 'org-1',
    slug: 'shop',
    displayName: 'Shop',
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const versions: ProjectVersion[] = [];
  const projectVersions: ProjectVersionRepo = {
    findByDigest: vi.fn(async (_pid, d) =>
      ok(versions.find((v) => v.bundleDigest === d) ?? null),
    ),
    getBySeq: vi.fn(async (_pid, s) => ok(versions.find((v) => v.seq === s) ?? null)),
    getById: vi.fn(async (id) => ok(versions.find((v) => v.id === id) ?? null)),
    listByProject: vi.fn(async () => ok(versions)),
    create: vi.fn(async ({ row }) => {
      const v: ProjectVersion = {
        id: row.id,
        orgId: row.orgId,
        projectId: 'proj-1',
        seq: versions.length + 1,
        bundleDigest: row.bundleDigest,
        bundleBlobKey: row.bundleBlobKey,
        bundleSizeBytes: row.bundleSizeBytes,
        summary: row.summary,
        uploadedByAccountId: row.uploadedByAccountId,
        createdAt: new Date(),
      };
      versions.push(v);
      return ok(v);
    }),
  };
  const projects = {
    findBySlug: vi.fn(async () => ok(project)),
  } as unknown as ProjectRepo;
  const blob: BlobStore = {
    putIfAbsent: vi.fn(async () => ok(undefined)),
    presignedGet: vi.fn(async () => ok('https://example.test/x')),
    getJson: async <T = unknown>() => ok({} as T),
    getRaw: vi.fn(async () => ok(Buffer.from(''))),
  };
  const ids: Ids = {
    uuid: () => '00000000-0000-0000-0000-000000000000',
    apiTokenPlaintext: () => 'rntme_pat_test',
  };
  return { projects, projectVersions, blob, ids };
}

describe('publishProjectVersion', () => {
  it('happy path stores blob and creates row', async () => {
    const fakes = makeFakeRepos();
    const r = await publishProjectVersion(
      {
        repos: { projects: fakes.projects, projectVersions: fakes.projectVersions },
        blob: fakes.blob,
        ids: fakes.ids,
      },
      {
        orgId: 'org-1',
        projectId: 'proj-1',
        accountId: 'acc-1',
        tokenId: null,
        bundleBytes: Buffer.from(
          '{"version":1,"files":{"project.json":{"name":"x","services":[]}}}',
        ),
        bundleDigest: 'sha256:' + 'f'.repeat(64),
        summary: {
          projectName: 'x',
          services: [],
          routes: { ui: {}, http: {} },
          middleware: {},
          mounts: [],
        },
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.seq).toBe(1);
    expect(fakes.blob.putIfAbsent).toHaveBeenCalledOnce();
  });

  it('idempotent duplicate digest skips blob upload and returns existing row', async () => {
    const fakes = makeFakeRepos();
    const input = {
      orgId: 'org-1',
      projectId: 'proj-1',
      accountId: 'acc-1',
      tokenId: null,
      bundleBytes: Buffer.from('x'),
      bundleDigest: 'sha256:' + '9'.repeat(64),
      summary: {
        projectName: 'x',
        services: [],
        routes: { ui: {}, http: {} },
        middleware: {},
        mounts: [],
      },
    };
    const deps = {
      repos: { projects: fakes.projects, projectVersions: fakes.projectVersions },
      blob: fakes.blob,
      ids: fakes.ids,
    };
    const a = await publishProjectVersion(deps, input);
    const b = await publishProjectVersion(deps, input);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.id).toBe(b.value.id);
    expect(fakes.blob.putIfAbsent).toHaveBeenCalledOnce();
  });
});
