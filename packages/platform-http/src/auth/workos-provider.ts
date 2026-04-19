import {
  ok,
  err,
  isOk,
  scopesForRole,
  type IdentityProvider,
  type AuthContext,
  type AuthSubject,
  type Role,
  type OrganizationRepo,
  type AccountRepo,
  type MembershipMirrorRepo,
} from '@rntme-cli/platform-core';
import type { WorkOSClient } from './workos-client.js';

type Deps = {
  workos: WorkOSClient;
  cookiePassword: string;
  organizations: OrganizationRepo;
  accounts: AccountRepo;
  memberships: MembershipMirrorRepo;
};

export class WorkOSAuthKitProvider implements IdentityProvider {
  readonly name = 'workos-authkit' as const;
  constructor(private readonly deps: Deps) {}

  async authenticate(ctx: AuthContext) {
    const cookie = ctx.cookieHeader ?? '';
    const match = /(?:^|; )rntme_session=([^;]+)/.exec(cookie);
    if (!match) {
      return err([{ code: 'PLATFORM_AUTH_MISSING' as const, message: 'no session cookie' }]);
    }
    const sealed = decodeURIComponent(match[1]!);
    try {
      const session = this.deps.workos.userManagement.loadSealedSession({
        sessionData: sealed,
        cookiePassword: this.deps.cookiePassword,
      });
      const auth = await session.authenticate();
      if (!auth.authenticated) {
        return err([
          {
            code: 'PLATFORM_AUTH_INVALID' as const,
            message: String(auth.reason ?? 'session invalid'),
          },
        ]);
      }

      const user = auth.user;
      const orgId = auth.organizationId;
      if (!orgId) {
        return err([{ code: 'PLATFORM_AUTH_INVALID' as const, message: 'no organization in session' }]);
      }

      const acct = await this.deps.accounts.findByWorkosUserId(user.id);
      if (!isOk(acct)) return acct;
      const org = await this.deps.organizations.findByWorkosId(orgId);
      if (!isOk(org)) return org;
      if (!acct.value || !org.value) {
        return err([{ code: 'PLATFORM_AUTH_INVALID' as const, message: 'mirror not yet synced' }]);
      }

      const mem = await this.deps.memberships.find(org.value.id, acct.value.id);
      if (!isOk(mem)) return mem;
      const role: Role = mem.value?.role === 'admin' ? 'admin' : 'member';

      const subject: AuthSubject = {
        account: {
          id: acct.value.id,
          workosUserId: acct.value.workosUserId,
          displayName: acct.value.displayName,
          email: acct.value.email,
        },
        org: {
          id: org.value.id,
          workosOrgId: org.value.workosOrganizationId,
          slug: org.value.slug,
        },
        role,
        scopes: scopesForRole(role),
        tokenId: undefined,
      };
      return ok(subject);
    } catch (cause) {
      return err([{ code: 'PLATFORM_AUTH_INVALID' as const, message: String(cause), cause }]);
    }
  }
}
