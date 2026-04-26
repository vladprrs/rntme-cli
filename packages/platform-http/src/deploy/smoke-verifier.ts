import { clearTimeout, setTimeout } from 'node:timers';
import type { VerificationReport } from '@rntme-cli/platform-core';

export type SmokeFetcher = (
  url: string,
  opts: { method: 'HEAD' | 'GET'; timeoutMs: number },
) => Promise<{ status: number | 'timeout' | 'error'; latencyMs: number; body?: string }>;

export type VerificationHints = {
  readonly healthUrl: string;
  readonly uiUrl?: string;
  readonly publicRouteUrls: readonly string[];
};

export class SmokeVerifier {
  constructor(private readonly fetcher: SmokeFetcher = defaultSmokeFetcher) {}

  async verify(applyResult: { verificationHints: VerificationHints }): Promise<VerificationReport> {
    const checks: VerificationReport['checks'] = [];
    const { verificationHints } = applyResult;

    const edge = await this.fetcher(verificationHints.healthUrl, {
      method: 'HEAD',
      timeoutMs: 5_000,
    });
    checks.push({
      name: 'edge-health',
      url: verificationHints.healthUrl,
      status: edge.status,
      latencyMs: edge.latencyMs,
      ok: is2xx(edge.status),
    });

    if (verificationHints.uiUrl) {
      const ui = await this.fetcher(verificationHints.uiUrl, {
        method: 'GET',
        timeoutMs: 10_000,
      });
      checks.push({
        name: 'ui',
        url: verificationHints.uiUrl,
        status: ui.status,
        latencyMs: ui.latencyMs,
        ok: is2xx(ui.status) && (ui.body ?? '').length > 0,
      });
    }

    for (const url of verificationHints.publicRouteUrls) {
      checks.push({
        name: 'public-route',
        url,
        status: 0,
        latencyMs: 0,
        ok: true,
        note: 'not auto-checked in MVP',
      });
    }

    const edgeOk = checks[0]?.ok ?? false;
    const allCheckedOk = checks.every((check) => check.ok || check.note === 'not auto-checked in MVP');
    return {
      checks,
      ok: edgeOk && allCheckedOk,
      partialOk: edgeOk && !allCheckedOk,
    };
  }
}

export const defaultSmokeFetcher: SmokeFetcher = async (url, opts) => {
  const start = Date.now();
  const ctrl = new globalThis.AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const response = await globalThis.fetch(url, { method: opts.method, signal: ctrl.signal });
    const body = opts.method === 'GET' ? await response.text() : undefined;
    return {
      status: response.status,
      latencyMs: Date.now() - start,
      ...(body === undefined ? {} : { body }),
    };
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    return {
      status: name === 'AbortError' ? 'timeout' : 'error',
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
};

function is2xx(status: number | 'timeout' | 'error'): boolean {
  return typeof status === 'number' && status >= 200 && status < 300;
}
