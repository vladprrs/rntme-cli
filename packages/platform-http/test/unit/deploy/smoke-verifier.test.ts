import { describe, expect, it } from 'vitest';
import { SmokeVerifier, type SmokeFetcher } from '../../../src/deploy/smoke-verifier.js';

const stubFetcher = (
  responses: Record<
    string,
    { status: number; body?: string; latencyMs?: number; throws?: 'timeout' | 'error' }
  >,
): SmokeFetcher => {
  return async (url) => {
    const response = responses[url];
    if (!response) throw new Error(`no stub for ${url}`);
    if (response.throws === 'timeout') {
      return { status: 'timeout', latencyMs: response.latencyMs ?? 5_000 };
    }
    if (response.throws === 'error') {
      return { status: 'error', latencyMs: response.latencyMs ?? 0 };
    }
    return {
      status: response.status,
      latencyMs: response.latencyMs ?? 1,
      body: response.body ?? '',
    };
  };
};

describe('SmokeVerifier', () => {
  it('returns ok when edge and UI checks pass', async () => {
    const verifier = new SmokeVerifier(
      stubFetcher({
        'https://edge.example/health': { status: 200 },
        'https://ui.example/': { status: 200, body: '<html>' },
      }),
    );

    const report = await verifier.verify({
      verificationHints: {
        healthUrl: 'https://edge.example/health',
        uiUrl: 'https://ui.example/',
        publicRouteUrls: [],
      },
    });

    expect(report.ok).toBe(true);
    expect(report.partialOk).toBe(false);
  });

  it('returns partialOk when edge passes but UI fails', async () => {
    const verifier = new SmokeVerifier(
      stubFetcher({
        'https://edge.example/health': { status: 200 },
        'https://ui.example/': { status: 500 },
      }),
    );

    const report = await verifier.verify({
      verificationHints: {
        healthUrl: 'https://edge.example/health',
        uiUrl: 'https://ui.example/',
        publicRouteUrls: [],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.partialOk).toBe(true);
  });

  it('returns not ok when the edge health check times out', async () => {
    const verifier = new SmokeVerifier(
      stubFetcher({
        'https://edge.example/health': { status: 200, throws: 'timeout' },
      }),
    );

    const report = await verifier.verify({
      verificationHints: {
        healthUrl: 'https://edge.example/health',
        publicRouteUrls: [],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.partialOk).toBe(false);
  });
});
