import { describe, expect, it } from 'vitest';
import { DEPLOY_CORE_ERROR_CODES, err, isErr, isOk, ok } from '../../src/index.js';

describe('@rntme-cli/deploy-core package surface', () => {
  it('exports Result helpers and error codes', () => {
    const success = ok({ value: 1 });
    const failure = err([
      {
        code: 'DEPLOY_PLAN_UNSUPPORTED_PRODUCTION_MODE',
        message: 'production mode is not supported in the MVP',
      },
    ]);

    expect(isOk(success)).toBe(true);
    expect(isErr(failure)).toBe(true);
    expect(DEPLOY_CORE_ERROR_CODES.DEPLOY_PLAN_UNSUPPORTED_PRODUCTION_MODE).toBe(
      'DEPLOY_PLAN_UNSUPPORTED_PRODUCTION_MODE',
    );
  });
});
