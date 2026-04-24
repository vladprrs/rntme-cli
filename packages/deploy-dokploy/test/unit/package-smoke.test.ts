import { describe, expect, it } from 'vitest';
import {
  DEPLOY_DOKPLOY_ERROR_CODES,
  err,
  isErr,
  isOk,
  ok,
} from '../../src/index.js';

describe('@rntme-cli/deploy-dokploy package surface', () => {
  it('exports Result helpers and Dokploy error codes', () => {
    const success = ok({ rendered: true });
    const failure = err([
      {
        code: 'DEPLOY_RENDER_DOKPLOY_MISSING_PROJECT',
        message: 'missing Dokploy project config',
      },
    ]);

    expect(isOk(success)).toBe(true);
    expect(isErr(failure)).toBe(true);
    expect(DEPLOY_DOKPLOY_ERROR_CODES.DEPLOY_RENDER_DOKPLOY_MISSING_PROJECT).toBe(
      'DEPLOY_RENDER_DOKPLOY_MISSING_PROJECT',
    );
  });
});
