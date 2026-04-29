import type {
  DeployTarget,
  DeployTargetAuthConfig,
  DeployTargetModules,
  DeployTargetWithSecret,
  EventBusConfig,
  PolicyValues,
} from '../schemas/deploy-target.js';
import type { PlatformError, Result } from '../types/result.js';

export type DeployTargetInsertRow = {
  readonly id: string;
  readonly orgId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly kind: 'dokploy';
  readonly dokployUrl: string;
  readonly publicBaseUrl: string | null;
  readonly dokployProjectId: string | null;
  readonly dokployProjectName: string | null;
  readonly allowCreateProject: boolean;
  readonly apiTokenCiphertext: Buffer;
  readonly apiTokenNonce: Buffer;
  readonly apiTokenKeyVersion: number;
  readonly eventBusConfig: EventBusConfig;
  readonly modules: DeployTargetModules;
  readonly auth: DeployTargetAuthConfig;
  readonly policyValues: PolicyValues;
  readonly isDefault: boolean;
};

export type DeployTargetUpdateRow = {
  readonly displayName?: string;
  readonly dokployUrl?: string;
  readonly publicBaseUrl?: string;
  readonly dokployProjectId?: string | null;
  readonly dokployProjectName?: string | null;
  readonly allowCreateProject?: boolean;
  readonly eventBusConfig?: EventBusConfig;
  readonly modules?: DeployTargetModules;
  readonly auth?: DeployTargetAuthConfig;
  readonly policyValues?: PolicyValues;
  readonly isDefault?: boolean;
};

export interface DeployTargetRepo {
  create(args: {
    row: DeployTargetInsertRow;
    auditActorAccountId: string;
    auditActorTokenId: string | null;
  }): Promise<Result<DeployTarget, PlatformError>>;

  update(args: {
    orgId: string;
    slug: string;
    patch: DeployTargetUpdateRow;
    auditActorAccountId: string;
    auditActorTokenId: string | null;
  }): Promise<Result<DeployTarget, PlatformError>>;

  rotateApiToken(args: {
    orgId: string;
    slug: string;
    ciphertext: Buffer;
    nonce: Buffer;
    keyVersion: number;
    auditActorAccountId: string;
    auditActorTokenId: string | null;
  }): Promise<Result<DeployTarget, PlatformError>>;

  setDefault(args: {
    orgId: string;
    slug: string;
    auditActorAccountId: string;
    auditActorTokenId: string | null;
  }): Promise<Result<DeployTarget, PlatformError>>;

  delete(args: {
    orgId: string;
    slug: string;
    auditActorAccountId: string;
    auditActorTokenId: string | null;
  }): Promise<Result<void, PlatformError>>;

  list(orgId: string): Promise<Result<readonly DeployTarget[], PlatformError>>;
  getBySlug(orgId: string, slug: string): Promise<Result<DeployTarget | null, PlatformError>>;
  getDefault(orgId: string): Promise<Result<DeployTarget | null, PlatformError>>;
  getWithSecretById(id: string): Promise<Result<DeployTargetWithSecret | null, PlatformError>>;
}
