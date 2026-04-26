import { describe, expectTypeOf, it } from 'vitest';
import type {
  ProjectVersionInsertRow,
  ProjectVersionRepo,
} from '../../../src/repos/project-version-repo.js';
import type { ProjectVersion } from '../../../src/schemas/project-version.js';
import type { PlatformError, Result } from '../../../src/types/result.js';

describe('ProjectVersionRepo type contract', () => {
  it('declares the expected method signatures', () => {
    type R = ProjectVersionRepo;
    expectTypeOf<R['create']>().parameters.toMatchTypeOf<[
      args: {
        projectId: string;
        row: ProjectVersionInsertRow;
        auditActorAccountId: string;
        auditActorTokenId: string | null;
      },
    ]>();
    expectTypeOf<R['create']>().returns.toMatchTypeOf<
      Promise<Result<ProjectVersion, PlatformError>>
    >();
    expectTypeOf<R['findByDigest']>().parameters.toMatchTypeOf<
      [projectId: string, digest: string]
    >();
    expectTypeOf<R['getBySeq']>().parameters.toMatchTypeOf<
      [projectId: string, seq: number]
    >();
  });
});
