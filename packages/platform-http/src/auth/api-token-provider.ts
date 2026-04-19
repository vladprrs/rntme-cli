import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  ok,
  err,
  isOk,
  type IdentityProvider,
  type AuthContext,
  type AuthSubject,
  type Role,
  type TokenRepo,
  type OrganizationRepo,
  type AccountRepo,
  type MembershipMirrorRepo,
} from '@rntme-cli/platform-core';

type Deps = {
  tokens: TokenRepo;
  organizations: OrganizationRepo;
  accounts: AccountRepo;
  memberships: MembershipMirrorRepo;
};

export class ApiTokenProvider implements IdentityProvider {
  readonly name = 'api-token' as const;
  constructor(private readonly deps: Deps) {}

  async authenticate(ctx: AuthContext) {
    const header = ctx.authorizationHeader;
    if (!header || !header.startsWith('Bearer rntme_pat_')) {
      return err([{ code: 'PLATFORM_AUTH_MISSING' as const, message: 'no bearer token' }]);
    }
    const plain = header.slice('Bearer '.length);
    const prefix = plain.slice(0, 12);
    const found = await this.deps.tokens.findByPrefix(prefix);
    if (!isOk(found)) return found;
    if (!found.value) {
      return err([{ code: 'PLATFORM_AUTH_INVALID' as const, message: 'token not found' }]);
    }
    const row = found.value;
    if (row.revokedAt) {
      return err([{ code: 'PLATFORM_AUTH_TOKEN_REVOKED' as const, message: 'token revoked' }]);
    }
    if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
      return err([{ code: 'PLATFORM_AUTH_TOKEN_EXPIRED' as const, message: 'token expired' }]);
    }
    const expected = Buffer.from(row.tokenHash);
    const actual = createHash('sha256').update(plain, 'utf8').digest();
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return err([{ code: 'PLATFORM_AUTH_INVALID' as const, message: 'token mismatch' }]);
    }

    const orgR = await this.deps.organizations.findById(row.orgId);
    if (!isOk(orgR)) return orgR;
    if (!orgR.value) {
      return err([{ code: 'PLATFORM_AUTH_INVALID' as const, message: 'token org missing' }]);
    }

    const acctR = await this.deps.accounts.findById(row.accountId);
    if (!isOk(acctR)) return acctR;
    if (!acctR.value || acctR.value.deletedAt) {
      return err([{ code: 'PLATFORM_AUTH_INVALID' as const, message: 'token account missing' }]);
    }
    const account = acctR.value;

    const mem = await this.deps.memberships.find(row.orgId, row.accountId);
    if (!isOk(mem)) return mem;
    const role: Role = mem.value?.role === 'admin' ? 'admin' : 'member';

    const subject: AuthSubject = {
      account: {
        id: account.id,
        workosUserId: account.workosUserId,
        displayName: account.displayName,
        email: account.email,
      },
      org: {
        id: orgR.value.id,
        workosOrgId: orgR.value.workosOrganizationId,
        slug: orgR.value.slug,
      },
      role,
      scopes: row.scopes,
      tokenId: row.id,
    };

    void this.deps.tokens.touchLastUsed(row.id);
    return ok(subject);
  }
}
