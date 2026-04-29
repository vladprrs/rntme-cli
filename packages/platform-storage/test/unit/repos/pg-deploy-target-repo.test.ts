import { describe, expect, it, vi } from 'vitest';
import { PgDeployTargetRepo } from '../../../src/repos/pg-deploy-target-repo.js';

describe('PgDeployTargetRepo.getWithSecretById', () => {
  it('requires an RLS org context before returning secret-bearing rows', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ org_id: '' }] });
    const repo = new PgDeployTargetRepo({ query } as never);

    const result = await repo.getWithSecretById('target-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe('PLATFORM_STORAGE_RLS_CONTEXT_REQUIRED');
    }
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("current_setting('app.org_id'");
  });

  it('queries by target id only after the RLS org context is present', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ org_id: '8d7bdbb5-9c8b-4773-b7b7-000000000001' }] })
      .mockResolvedValueOnce({ rows: [] });
    const repo = new PgDeployTargetRepo({ query } as never);

    const result = await repo.getWithSecretById('target-1');

    expect(result.ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain('SELECT * FROM deploy_target WHERE id=$1 AND org_id=$2 LIMIT 1');
  });
});
