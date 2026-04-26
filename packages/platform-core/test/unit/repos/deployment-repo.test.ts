import { describe, expectTypeOf, it } from 'vitest';
import type {
  DeploymentFinalize,
  DeploymentRepo,
} from '../../../src/repos/deployment-repo.js';
import type {
  Deployment,
  DeploymentLogLine,
  DeploymentStatus,
} from '../../../src/schemas/deployment.js';
import type { PlatformError, Result } from '../../../src/types/result.js';

describe('DeploymentRepo', () => {
  it('exposes deployment lifecycle methods', () => {
    expectTypeOf<DeploymentRepo['create']>().returns.resolves.toEqualTypeOf<
      Result<Deployment, PlatformError>
    >();
    expectTypeOf<DeploymentRepo['getById']>().returns.resolves.toEqualTypeOf<
      Result<Deployment | null, PlatformError>
    >();
    expectTypeOf<DeploymentRepo['listByProject']>().returns.resolves.toEqualTypeOf<
      Result<readonly Deployment[], PlatformError>
    >();
    expectTypeOf<DeploymentRepo['transition']>().returns.resolves.toEqualTypeOf<
      Result<void, PlatformError>
    >();
    expectTypeOf<DeploymentRepo['finalize']>().returns.resolves.toEqualTypeOf<
      Result<void, PlatformError>
    >();
    expectTypeOf<DeploymentRepo['appendLog']>().returns.resolves.toEqualTypeOf<
      Result<void, PlatformError>
    >();
    expectTypeOf<DeploymentRepo['readLogs']>().returns.resolves.toEqualTypeOf<
      Result<{ lines: readonly DeploymentLogLine[]; lastLineId: number }, PlatformError>
    >();
    expectTypeOf<DeploymentRepo['findStaleRunning']>().returns.resolves.toEqualTypeOf<
      Result<readonly { id: string; orgId: string }[], PlatformError>
    >();
  });

  it('finalize status excludes non-terminal states', () => {
    expectTypeOf<DeploymentFinalize['status']>().exclude<'queued' | 'running'>().toEqualTypeOf<
      Exclude<DeploymentStatus, 'queued' | 'running'>
    >();
  });
});
