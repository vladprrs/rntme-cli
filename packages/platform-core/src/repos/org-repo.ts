import type { Organization } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export interface OrganizationRepo {
  /** Excludes archived orgs (archived_at IS NOT NULL). */
  findById(id: string): Promise<Result<Organization | null, PlatformError>>;
  /** Excludes archived orgs (archived_at IS NOT NULL). */
  findBySlug(slug: string): Promise<Result<Organization | null, PlatformError>>;
  /** Excludes archived orgs (archived_at IS NOT NULL). */
  findByWorkosId(workosId: string): Promise<Result<Organization | null, PlatformError>>;
  /** Returns rows regardless of archived state — used by cascade/deleted-event paths. */
  findByIdIncludingArchived(id: string): Promise<Result<Organization | null, PlatformError>>;
  /** Returns rows regardless of archived state — used by cascade/deleted-event paths. */
  findBySlugIncludingArchived(slug: string): Promise<Result<Organization | null, PlatformError>>;
  /** Returns rows regardless of archived state — used by cascade/deleted-event paths. */
  findByWorkosIdIncludingArchived(workosId: string): Promise<Result<Organization | null, PlatformError>>;
  listForAccount(accountId: string): Promise<Result<readonly Organization[], PlatformError>>;
  upsertFromWorkos(args: {
    workosOrganizationId: string;
    slug: string;
    displayName: string;
  }): Promise<Result<Organization, PlatformError>>;
  /** Soft-archive — sets archived_at = now(). Idempotent. */
  archive(id: string): Promise<Result<void, PlatformError>>;
}
