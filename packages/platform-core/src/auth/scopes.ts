import type { z } from 'zod';
import type { ScopeSchema } from '../schemas/entities.js';

export type Scope = z.infer<typeof ScopeSchema>;
export type Role = 'admin' | 'member';

const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  admin: ['project:read', 'project:write', 'version:publish', 'member:read', 'token:manage'],
  member: ['project:read', 'project:write', 'version:publish'],
};

export function scopesForRole(role: Role): readonly Scope[] {
  return ROLE_SCOPES[role];
}

export function tokenScopesSubsetOf(requested: readonly Scope[], creatorScopes: readonly Scope[]): boolean {
  const allowed = new Set(creatorScopes);
  return requested.every((s) => allowed.has(s));
}
