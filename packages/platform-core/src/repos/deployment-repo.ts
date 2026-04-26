import type {
  Deployment,
  DeploymentLogLine,
  DeploymentStatus,
  VerificationReport,
} from '../schemas/deployment.js';
import type { PlatformError, Result } from '../types/result.js';

export type DeploymentInsertRow = {
  readonly id: string;
  readonly projectId: string;
  readonly orgId: string;
  readonly projectVersionId: string;
  readonly targetId: string;
  readonly configOverrides: Record<string, unknown>;
  readonly startedByAccountId: string;
};

export type DeploymentFinalize = {
  readonly status: Exclude<DeploymentStatus, 'queued' | 'running'>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly applyResult?: Record<string, unknown>;
  readonly verificationReport?: VerificationReport;
  readonly warnings?: unknown[];
};

export interface DeploymentRepo {
  create(args: {
    row: DeploymentInsertRow;
    auditActorAccountId: string;
    auditActorTokenId: string | null;
  }): Promise<Result<Deployment, PlatformError>>;

  getById(id: string): Promise<Result<Deployment | null, PlatformError>>;

  listByProject(
    projectId: string,
    opts: { status?: DeploymentStatus[]; limit: number; cursor?: Date },
  ): Promise<Result<readonly Deployment[], PlatformError>>;

  transition(
    id: string,
    status: 'running',
    side: { startedAt: Date },
  ): Promise<Result<void, PlatformError>>;

  setRenderedDigest(id: string, digest: string): Promise<Result<void, PlatformError>>;
  setApplyResult(id: string, applyResult: Record<string, unknown>): Promise<Result<void, PlatformError>>;
  finalize(id: string, args: DeploymentFinalize): Promise<Result<void, PlatformError>>;
  touchHeartbeat(id: string): Promise<Result<void, PlatformError>>;

  appendLog(args: {
    deploymentId: string;
    orgId: string;
    level: 'info' | 'warn' | 'error';
    step: string;
    message: string;
  }): Promise<Result<void, PlatformError>>;

  readLogs(args: {
    deploymentId: string;
    sinceLineId: number;
    limit: number;
  }): Promise<Result<{ lines: readonly DeploymentLogLine[]; lastLineId: number }, PlatformError>>;

  findStaleRunning(
    staleAfterSeconds: number,
  ): Promise<Result<readonly { id: string; orgId: string }[], PlatformError>>;
}
