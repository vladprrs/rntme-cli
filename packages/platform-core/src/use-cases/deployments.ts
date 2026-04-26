import type { Ids } from '../ids.js';
import type { DeployTargetRepo } from '../repos/deploy-target-repo.js';
import type { DeploymentRepo } from '../repos/deployment-repo.js';
import type { ProjectVersionRepo } from '../repos/project-version-repo.js';
import type {
  Deployment,
  DeploymentStatus,
  StartDeploymentRequest,
} from '../schemas/deployment.js';
import { err, isOk, type PlatformError, type Result } from '../types/result.js';

type Deps = {
  repos: {
    projectVersions: ProjectVersionRepo;
    deployTargets: DeployTargetRepo;
    deployments: DeploymentRepo;
  };
  ids: Ids;
};

export type StartDeploymentInput = {
  orgId: string;
  projectId: string;
  accountId: string;
  tokenId: string | null;
  req: StartDeploymentRequest;
};

export async function startDeployment(
  deps: Deps,
  input: StartDeploymentInput,
): Promise<Result<Deployment, PlatformError>> {
  const version = await deps.repos.projectVersions.getBySeq(
    input.projectId,
    input.req.projectVersionSeq,
  );
  if (!isOk(version)) return version;
  if (!version.value) {
    return err([
      {
        code: 'DEPLOY_REQUEST_VERSION_NOT_FOUND',
        message: `project version seq ${input.req.projectVersionSeq} not found`,
      },
    ]);
  }

  const target =
    input.req.targetSlug === undefined
      ? await deps.repos.deployTargets.getDefault(input.orgId)
      : await deps.repos.deployTargets.getBySlug(input.orgId, input.req.targetSlug);
  if (!isOk(target)) return target;
  if (!target.value) {
    return err([
      {
        code:
          input.req.targetSlug === undefined
            ? 'DEPLOY_REQUEST_TARGET_NOT_SPECIFIED'
            : 'DEPLOY_REQUEST_TARGET_NOT_FOUND',
        message: input.req.targetSlug ?? 'no default deploy target configured',
      },
    ]);
  }
  if (target.value.orgId !== input.orgId) {
    return err([
      {
        code: 'DEPLOY_REQUEST_TARGET_NOT_FOUND',
        message: input.req.targetSlug ?? target.value.slug,
      },
    ]);
  }

  return deps.repos.deployments.create({
    row: {
      id: deps.ids.uuid(),
      projectId: input.projectId,
      orgId: input.orgId,
      projectVersionId: version.value.id,
      targetId: target.value.id,
      configOverrides: input.req.configOverrides,
      startedByAccountId: input.accountId,
    },
    auditActorAccountId: input.accountId,
    auditActorTokenId: input.tokenId,
  });
}

export async function listDeployments(
  deps: { repos: { deployments: DeploymentRepo } },
  input: { projectId: string; status?: DeploymentStatus[]; limit: number; cursor?: Date },
): Promise<Result<readonly Deployment[], PlatformError>> {
  return deps.repos.deployments.listByProject(input.projectId, input);
}

export async function getDeployment(
  deps: { repos: { deployments: DeploymentRepo } },
  input: { id: string },
): Promise<Result<Deployment | null, PlatformError>> {
  return deps.repos.deployments.getById(input.id);
}

export async function readDeploymentLogs(
  deps: { repos: { deployments: DeploymentRepo } },
  input: { deploymentId: string; sinceLineId: number; limit: number },
) {
  return deps.repos.deployments.readLogs(input);
}
