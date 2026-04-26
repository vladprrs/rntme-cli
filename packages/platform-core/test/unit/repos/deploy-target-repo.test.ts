import { describe, expectTypeOf, it } from 'vitest';
import type {
  DeployTargetRepo,
  DeployTargetInsertRow,
  DeployTargetUpdateRow,
} from '../../../src/repos/deploy-target-repo.js';
import type { DeployTarget, DeployTargetWithSecret } from '../../../src/schemas/deploy-target.js';
import type { PlatformError, Result } from '../../../src/types/result.js';

describe('DeployTargetRepo', () => {
  it('exposes deploy target persistence methods', () => {
    expectTypeOf<DeployTargetRepo['create']>().returns.resolves.toEqualTypeOf<
      Result<DeployTarget, PlatformError>
    >();
    expectTypeOf<DeployTargetRepo['update']>().returns.resolves.toEqualTypeOf<
      Result<DeployTarget, PlatformError>
    >();
    expectTypeOf<DeployTargetRepo['rotateApiToken']>().returns.resolves.toEqualTypeOf<
      Result<DeployTarget, PlatformError>
    >();
    expectTypeOf<DeployTargetRepo['setDefault']>().returns.resolves.toEqualTypeOf<
      Result<DeployTarget, PlatformError>
    >();
    expectTypeOf<DeployTargetRepo['delete']>().returns.resolves.toEqualTypeOf<
      Result<void, PlatformError>
    >();
    expectTypeOf<DeployTargetRepo['list']>().returns.resolves.toEqualTypeOf<
      Result<readonly DeployTarget[], PlatformError>
    >();
    expectTypeOf<DeployTargetRepo['getBySlug']>().returns.resolves.toEqualTypeOf<
      Result<DeployTarget | null, PlatformError>
    >();
    expectTypeOf<DeployTargetRepo['getDefault']>().returns.resolves.toEqualTypeOf<
      Result<DeployTarget | null, PlatformError>
    >();
    expectTypeOf<DeployTargetRepo['getWithSecretById']>().returns.resolves.toEqualTypeOf<
      Result<DeployTargetWithSecret | null, PlatformError>
    >();
  });

  it('keeps secret writes out of normal update rows', () => {
    expectTypeOf<DeployTargetUpdateRow>().not.toHaveProperty('apiTokenCiphertext');
    expectTypeOf<DeployTargetInsertRow>().toHaveProperty('apiTokenCiphertext');
  });
});
