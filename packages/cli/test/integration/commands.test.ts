import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { main } from '../../src/bin/cli.js';

const BASE = 'https://test.platform';
const PAT = 'rntme_pat_aaaaaaaaaaaaaaaaaaaaaa';

type RunResult = { code: number; stdout: string; stderr: string };

async function runCli(argv: string[]): Promise<RunResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stderr.write;

  const envBackup = { ...process.env };
  process.env['RNTME_BASE_URL'] = BASE;
  process.env['RNTME_TOKEN'] = PAT;

  try {
    const code = await main(argv);
    return { code, stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.env = envBackup;
  }
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('whoami', () => {
  it('200 → human output with account/org/role', async () => {
    server.use(
      http.get(`${BASE}/v1/auth/me`, () =>
        HttpResponse.json({
          account: { id: 'a', workosUserId: 'u', displayName: 'Vlad', email: 'v@example.com' },
          org: { id: 'o', workosOrgId: 'wo', slug: 'acme' },
          role: 'admin',
          scopes: ['project:read'],
          tokenId: null,
        }),
      ),
    );
    const r = await runCli(['whoami']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('acme');
    expect(r.stdout).toContain('admin');
  });

  it('401 → exit 3 with PLATFORM_AUTH_INVALID', async () => {
    server.use(
      http.get(`${BASE}/v1/auth/me`, () =>
        HttpResponse.json(
          { error: { code: 'PLATFORM_AUTH_INVALID', message: 'bad token' } },
          { status: 401 },
        ),
      ),
    );
    const r = await runCli(['whoami']);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain('PLATFORM_AUTH_INVALID');
  });
});

describe('project create', () => {
  it('201 → exit 0 with slug', async () => {
    server.use(
      http.post(`${BASE}/v1/orgs/acme/projects`, () =>
        HttpResponse.json(
          {
            project: {
              id: 'p',
              orgId: 'o',
              slug: 'test',
              displayName: 'Test',
              createdAt: '2026-04-19T00:00:00Z',
              updatedAt: '2026-04-19T00:00:00Z',
              archivedAt: null,
            },
          },
          { status: 201 },
        ),
      ),
    );
    const r = await runCli(['--org', 'acme', 'project', 'create', 'test']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('test');
  });
});
