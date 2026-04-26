import type { z } from 'zod';
import type { ScopeSchema } from '../schemas/entities.js';

export type Scope = z.infer<typeof ScopeSchema>;
export type Role = 'admin' | 'member';

const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  admin: [
    'project:read',
    'project:write',
    'version:publish',
    'member:read',
    'token:manage',
    'deploy:target:manage',
    'deploy:execute',
  ],
  member: ['project:read', 'project:write', 'version:publish', 'deploy:execute'],
};

export function scopesForRole(role: Role): readonly Scope[] {
  return ROLE_SCOPES[role];
}

export function tokenScopesSubsetOf(requested: readonly Scope[], creatorScopes: readonly Scope[]): boolean {
  const allowed = new Set(creatorScopes);
  return requested.every((s) => allowed.has(s));
}
