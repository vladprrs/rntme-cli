import type { Organization } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export interface OrganizationRepo {
  findById(id: string): Promise<Result<Organization | null, PlatformError>>;
  findBySlug(slug: string): Promise<Result<Organization | null, PlatformError>>;
  findByWorkosId(workosId: string): Promise<Result<Organization | null, PlatformError>>;
  listForAccount(accountId: string): Promise<Result<readonly Organization[], PlatformError>>;
  upsertFromWorkos(args: {
    workosOrganizationId: string;
    slug: string;
    displayName: string;
  }): Promise<Result<Organization, PlatformError>>;
  archive(id: string): Promise<Result<void, PlatformError>>;
}
