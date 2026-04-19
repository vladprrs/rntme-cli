import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { apiCall } from '../../../src/api/client.js';

const OkSchema = z.object({ ok: z.boolean() });

describe('apiCall', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('200 → parsed response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const r = await apiCall({ method: 'GET', path: '/x', baseUrl: 'https://p', token: null, responseSchema: OkSchema });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ ok: true });
  });

  it('2xx with bad shape → CLI_RESPONSE_PARSE_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"bogus":1}', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const r = await apiCall({ method: 'GET', path: '/x', baseUrl: 'https://p', token: null, responseSchema: OkSchema });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ kind: 'http', code: 'CLI_RESPONSE_PARSE_FAILED' });
  });

  it('4xx envelope → ApiError with platform code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'PLATFORM_AUTH_INVALID', message: 'bad token' },
    }), { status: 401, headers: { 'content-type': 'application/json' } })));
    const r = await apiCall({ method: 'GET', path: '/x', baseUrl: 'https://p', token: 'rntme_pat_aaaaaaaaaaaaaaaaaaaaaa', responseSchema: OkSchema });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('http');
      if (r.error.kind === 'http') {
        expect(r.error.code).toBe('PLATFORM_AUTH_INVALID');
        expect(r.error.status).toBe(401);
      }
    }
  });

  it('non-JSON 5xx → PLATFORM_INTERNAL synthetic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>500</html>', { status: 500 })));
    const r = await apiCall({ method: 'GET', path: '/x', baseUrl: 'https://p', token: null, responseSchema: OkSchema });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'http') {
      expect(r.error.code).toBe('PLATFORM_INTERNAL');
      expect(r.error.status).toBe(500);
    }
  });

  it('network error → NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await apiCall({ method: 'GET', path: '/x', baseUrl: 'https://p', token: null, responseSchema: OkSchema });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('network');
  });

  it('sends Authorization when token provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiCall({ method: 'GET', path: '/x', baseUrl: 'https://p', token: 'rntme_pat_aaaaaaaaaaaaaaaaaaaaaa', responseSchema: OkSchema });
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('fetch was not called');
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Bearer /);
    expect(headers['X-Request-ID']).toMatch(/^req_/);
  });

  it('nested[] preserved from envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'PLATFORM_VALIDATION_BUNDLE_FAILED',
        message: 'bundle validation failed',
        cause: { errors: [{ code: 'QSM_STRUCT_DUP', message: 'dup', path: 'x' }] },
      },
    }), { status: 422, headers: { 'content-type': 'application/json' } })));
    const r = await apiCall({ method: 'POST', path: '/x', baseUrl: 'https://p', token: null, responseSchema: OkSchema, body: {} });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'http') {
      expect(r.error.nested).toHaveLength(1);
      expect(r.error.nested?.[0]?.code).toBe('QSM_STRUCT_DUP');
    }
  });
});
