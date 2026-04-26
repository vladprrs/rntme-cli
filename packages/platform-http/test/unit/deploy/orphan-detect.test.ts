import { describe, expect, it, vi } from 'vitest';
import { ok } from '@rntme-cli/platform-core';
import { startOrphanDetectLoop } from '../../../src/deploy/orphan-detect.js';

describe('startOrphanDetectLoop', () => {
  it('finalizes stale deployments as failed_orphaned on startup', async () => {
    const finalize = vi.fn(async () => ok(undefined));
    const deps = {
      findStaleRunning: vi.fn(async () =>
        ok([{ id: 'dep-1', orgId: 'org-1' }, { id: 'dep-2', orgId: 'org-2' }]),
      ),
      withOrgTx: vi.fn(async (_orgId: string, fn: (repos: never) => Promise<unknown>) =>
        fn({ deployments: { finalize } } as never),
      ),
      logger: { warn: vi.fn() },
    };

    const loop = startOrphanDetectLoop(deps as never, 60_000);
    await vi.waitFor(() => expect(finalize).toHaveBeenCalledTimes(2));
    loop.stop();

    expect(finalize).toHaveBeenCalledWith('dep-1', {
      status: 'failed_orphaned',
      errorCode: 'DEPLOY_EXECUTOR_ORPHANED',
      errorMessage: 'no heartbeat for >=60s',
    });
  });

  it('stops future interval ticks', async () => {
    vi.useFakeTimers();
    const deps = {
      findStaleRunning: vi.fn(async () => ok([])),
      withOrgTx: vi.fn(),
      logger: { warn: vi.fn() },
    };

    const loop = startOrphanDetectLoop(deps as never, 100);
    await vi.runOnlyPendingTimersAsync();
    loop.stop();
    const callsAfterStop = deps.findStaleRunning.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);

    expect(deps.findStaleRunning).toHaveBeenCalled();
    expect(deps.findStaleRunning).toHaveBeenCalledTimes(callsAfterStop);
    vi.useRealTimers();
  });
});
