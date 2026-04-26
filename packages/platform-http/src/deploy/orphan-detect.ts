import { clearInterval, setInterval } from 'node:timers';
import { isOk, type DeploymentRepo, type PlatformError, type Result } from '@rntme-cli/platform-core';
import type { Logger } from 'pino';

export type OrphanDetectDeps = {
  readonly withOrgTx: <T>(
    orgId: string,
    fn: (repos: { deployments: DeploymentRepo }) => Promise<T>,
  ) => Promise<T>;
  readonly findStaleRunning: (
    staleAfterSeconds: number,
  ) => Promise<Result<readonly { id: string; orgId: string }[], PlatformError>>;
  readonly logger: Pick<Logger, 'warn'>;
};

export function startOrphanDetectLoop(
  deps: OrphanDetectDeps,
  intervalMs = 60_000,
): { stop: () => void } {
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const stale = await deps.findStaleRunning(60);
    if (!isOk(stale)) {
      deps.logger.warn({ errors: stale.errors }, 'orphan-detect findStaleRunning failed');
      return;
    }
    for (const { id, orgId } of stale.value) {
      await deps.withOrgTx(orgId, async (repos) => {
        const finalized = await repos.deployments.finalize(id, {
          status: 'failed_orphaned',
          errorCode: 'DEPLOY_EXECUTOR_ORPHANED',
          errorMessage: 'no heartbeat for >=60s',
        });
        if (!isOk(finalized)) {
          deps.logger.warn({ deploymentId: id, errors: finalized.errors }, 'orphan finalize failed');
        }
      });
    }
  };

  void tick();
  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(handle);
    },
  };
}
