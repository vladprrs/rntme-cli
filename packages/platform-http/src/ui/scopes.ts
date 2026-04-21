import type { AuthSubject, Scope } from '@rntme-cli/platform-core';

export function hasScope(subject: AuthSubject | null | undefined, scope: Scope): boolean {
  if (!subject || !Array.isArray(subject.scopes)) return false;
  return subject.scopes.includes(scope);
}
