import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runProjectPublish } from '../../../../src/commands/project/publish.js';

const projectVersion = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  seq: 7,
  bundleDigest: 'sha256:' + 'a'.repeat(64),
  bundleBlobKey: 'project-versions/demo/7.json',
  bundleSizeBytes: 123,
  summary: {
    projectName: 'demo',
    services: ['app'],
    routes: { ui: {}, http: {} },
    middleware: {},
    mounts: [],
  },
  uploadedByAccountId: '44444444-4444-4444-8444-444444444444',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function writeBlueprint(dir: string): void {
  cpSync(resolve('../../../packages/blueprint/test/fixtures/product-catalog-project'), dir, {
    recursive: true,
  });
}

describe('runProjectPublish', () => {
  const realFetch = globalThis.fetch;
  const realCwd = process.cwd();
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rntme-project-publish-'));
    writeBlueprint(tmp);
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(realCwd);
    rmSync(tmp, { recursive: true, force: true });
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('validates locally and uploads a canonical bundle with the project bundle content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: projectVersion }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const exit = await runProjectPublish({ dryRun: false }, {
      org: 'acme',
      project: 'demo',
      token: 'rntme_pat_test',
      baseUrl: 'https://platform.example',
      json: true,
    });

    expect(exit).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://platform.example/v1/orgs/acme/projects/demo/versions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/rntme-project-bundle+json');
    expect(JSON.parse(init.body as string)).toMatchObject({
      version: 1,
      files: {
        'project.json': expect.any(Object),
        'pdm/pdm.json': expect.any(Object),
        'services/app/qsm/qsm.json': expect.any(Object),
        'services/app/service.json': expect.any(Object),
        'services/app/ui/manifest.json': expect.any(Object),
        'services/catalog/service.json': expect.any(Object),
        'services/inventory/service.json': expect.any(Object),
        'services/pricing/service.json': expect.any(Object),
      },
    });
  });

  it('does not call the API for --dry-run after local validation and bundling', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const exit = await runProjectPublish({ dryRun: true }, {
      org: 'acme',
      project: 'demo',
      token: 'rntme_pat_test',
      baseUrl: 'https://platform.example',
      json: true,
    });

    expect(exit).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates the project and retries publish when --create-project receives project 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'PLATFORM_TENANCY_PROJECT_NOT_FOUND', message: 'demo' } }), { status: 404 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            project: {
              id: '33333333-3333-4333-8333-333333333333',
              orgId: '22222222-2222-4222-8222-222222222222',
              slug: 'demo',
              displayName: 'demo',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              archivedAt: null,
            },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: projectVersion }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const exit = await runProjectPublish({ createProject: true }, {
      org: 'acme',
      project: 'demo',
      token: 'rntme_pat_test',
      baseUrl: 'https://platform.example',
      json: true,
    });

    expect(exit).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://platform.example/v1/orgs/acme/projects');
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({ slug: 'demo', displayName: 'demo' });
  });
});
