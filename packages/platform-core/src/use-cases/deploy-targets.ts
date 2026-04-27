import type { Ids } from '../ids.js';
import type { DeployTargetRepo, DeployTargetUpdateRow } from '../repos/deploy-target-repo.js';
import type { SecretCipher } from '../secret/secret-cipher.js';
import type {
  CreateDeployTargetRequest,
  DeployTarget,
  RotateApiTokenRequest,
  UpdateDeployTargetRequest,
} from '../schemas/deploy-target.js';
import { err, type PlatformError, type Result } from '../types/result.js';

type Deps = {
  repos: { deployTargets: DeployTargetRepo };
  cipher: SecretCipher;
  ids: Ids;
};

type Actor = {
  orgId: string;
  accountId: string;
  tokenId: string | null;
};

export async function createDeployTarget(
  deps: Deps,
  input: Actor & { req: CreateDeployTargetRequest },
): Promise<Result<DeployTarget, PlatformError>> {
  const encrypted = encryptSecret(deps.cipher, input.req.apiToken);
  if (!encrypted.ok) return encrypted;
  return deps.repos.deployTargets.create({
    row: {
      id: deps.ids.uuid(),
      orgId: input.orgId,
      slug: input.req.slug,
      displayName: input.req.displayName,
      kind: input.req.kind,
      dokployUrl: input.req.dokployUrl,
      publicBaseUrl: input.req.publicBaseUrl,
      dokployProjectId: input.req.dokployProjectId ?? null,
      dokployProjectName: input.req.dokployProjectName ?? null,
      allowCreateProject: input.req.allowCreateProject,
      apiTokenCiphertext: encrypted.value.ciphertext,
      apiTokenNonce: encrypted.value.nonce,
      apiTokenKeyVersion: encrypted.value.keyVersion,
      eventBusConfig: input.req.eventBus,
      policyValues: input.req.policyValues,
      isDefault: input.req.isDefault,
    },
    auditActorAccountId: input.accountId,
    auditActorTokenId: input.tokenId,
  });
}

export async function updateDeployTarget(
  deps: Pick<Deps, 'repos'>,
  input: Actor & { slug: string; patch: UpdateDeployTargetRequest },
): Promise<Result<DeployTarget, PlatformError>> {
  const patch: {
    -readonly [K in keyof DeployTargetUpdateRow]?: DeployTargetUpdateRow[K];
  } = {};
  if (input.patch.displayName !== undefined) patch.displayName = input.patch.displayName;
  if (input.patch.dokployUrl !== undefined) patch.dokployUrl = input.patch.dokployUrl;
  if (input.patch.publicBaseUrl !== undefined) patch.publicBaseUrl = input.patch.publicBaseUrl;
  if (input.patch.dokployProjectId !== undefined) patch.dokployProjectId = input.patch.dokployProjectId;
  if (input.patch.dokployProjectName !== undefined) {
    patch.dokployProjectName = input.patch.dokployProjectName;
  }
  if (input.patch.allowCreateProject !== undefined) {
    patch.allowCreateProject = input.patch.allowCreateProject;
  }
  if (input.patch.eventBus !== undefined) patch.eventBusConfig = input.patch.eventBus;
  if (input.patch.policyValues !== undefined) patch.policyValues = input.patch.policyValues;
  if (input.patch.isDefault !== undefined) patch.isDefault = input.patch.isDefault;

  return deps.repos.deployTargets.update({
    orgId: input.orgId,
    slug: input.slug,
    patch,
    auditActorAccountId: input.accountId,
    auditActorTokenId: input.tokenId,
  });
}

export async function rotateDeployTargetApiToken(
  deps: Deps,
  input: Actor & { slug: string; req: RotateApiTokenRequest },
): Promise<Result<DeployTarget, PlatformError>> {
  const encrypted = encryptSecret(deps.cipher, input.req.apiToken);
  if (!encrypted.ok) return encrypted;
  return deps.repos.deployTargets.rotateApiToken({
    orgId: input.orgId,
    slug: input.slug,
    ciphertext: encrypted.value.ciphertext,
    nonce: encrypted.value.nonce,
    keyVersion: encrypted.value.keyVersion,
    auditActorAccountId: input.accountId,
    auditActorTokenId: input.tokenId,
  });
}

export async function setDefaultDeployTarget(
  deps: Pick<Deps, 'repos'>,
  input: Actor & { slug: string },
): Promise<Result<DeployTarget, PlatformError>> {
  return deps.repos.deployTargets.setDefault({
    orgId: input.orgId,
    slug: input.slug,
    auditActorAccountId: input.accountId,
    auditActorTokenId: input.tokenId,
  });
}

export async function deleteDeployTarget(
  deps: Pick<Deps, 'repos'>,
  input: Actor & { slug: string },
): Promise<Result<void, PlatformError>> {
  return deps.repos.deployTargets.delete({
    orgId: input.orgId,
    slug: input.slug,
    auditActorAccountId: input.accountId,
    auditActorTokenId: input.tokenId,
  });
}

export async function listDeployTargets(
  deps: Pick<Deps, 'repos'>,
  input: { orgId: string },
): Promise<Result<readonly DeployTarget[], PlatformError>> {
  return deps.repos.deployTargets.list(input.orgId);
}

export async function getDeployTarget(
  deps: Pick<Deps, 'repos'>,
  input: { orgId: string; slug: string },
): Promise<Result<DeployTarget | null, PlatformError>> {
  return deps.repos.deployTargets.getBySlug(input.orgId, input.slug);
}

function encryptSecret(cipher: SecretCipher, plaintext: string) {
  try {
    return { ok: true as const, value: cipher.encrypt(plaintext) };
  } catch (cause) {
    return err<PlatformError>([
      {
        code: 'PLATFORM_INTERNAL',
        message: 'failed to encrypt deploy target secret',
        cause,
      },
    ]);
  }
}
