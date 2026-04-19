import { createHash } from 'node:crypto';
import { ok, isOk, type Result, type PlatformError } from '../types/result.js';
import type { ApiToken } from '../schemas/entities.js';
import type { Scope } from '../auth/scopes.js';
import type { TokenRepo } from '../repos/token-repo.js';
import type { Ids } from '../ids.js';
import { tokenScopesSubsetOf } from '../auth/scopes.js';

type CreatedToken = { readonly token: ApiToken; readonly plaintext: string };

export async function createToken(
  deps: { repos: { tokens: TokenRepo }; ids: Ids },
  input: {
    orgId: string;
    accountId: string;
    name: string;
    scopes: readonly Scope[];
    expiresAt: Date | null;
    creatorScopes: readonly Scope[];
  },
): Promise<Result<CreatedToken, PlatformError>> {
  if (!tokenScopesSubsetOf(input.scopes, input.creatorScopes)) {
    return {
      ok: false,
      errors: [{ code: 'PLATFORM_AUTH_FORBIDDEN', message: 'requested scopes exceed creator scopes' }],
    };
  }
  const plaintext = deps.ids.apiTokenPlaintext();
  const tokenHash = new Uint8Array(createHash('sha256').update(plaintext).digest());
  const prefix = plaintext.slice(0, 12);
  const r = await deps.repos.tokens.create({
    id: deps.ids.uuid(),
    orgId: input.orgId,
    accountId: input.accountId,
    name: input.name,
    tokenHash,
    prefix,
    scopes: input.scopes,
    expiresAt: input.expiresAt,
  });
  if (!isOk(r)) return r;
  return ok({ token: r.value, plaintext });
}

export async function listTokens(
  deps: { repos: { tokens: TokenRepo } },
  input: { orgId: string },
): Promise<Result<readonly ApiToken[], PlatformError>> {
  return deps.repos.tokens.list(input.orgId);
}

export async function revokeToken(
  deps: { repos: { tokens: TokenRepo } },
  input: { orgId: string; id: string },
): Promise<Result<void, PlatformError>> {
  return deps.repos.tokens.revoke(input.orgId, input.id);
}
