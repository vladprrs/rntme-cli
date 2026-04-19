import type { Result, PlatformError } from '../types/result.js';
import type { Scope, Role } from './scopes.js';

export type AuthContext = {
  readonly authorizationHeader: string | undefined;
  readonly cookieHeader: string | undefined;
};

export type AuthSubject = {
  readonly account: {
    readonly id: string;
    readonly workosUserId: string;
    readonly displayName: string;
    readonly email: string | null;
  };
  readonly org: { readonly id: string; readonly workosOrgId: string; readonly slug: string };
  readonly role: Role;
  readonly scopes: readonly Scope[];
  readonly tokenId: string | undefined;
};

export interface IdentityProvider {
  readonly name: 'workos-authkit' | 'api-token';
  authenticate(ctx: AuthContext): Promise<Result<AuthSubject, PlatformError>>;
}
