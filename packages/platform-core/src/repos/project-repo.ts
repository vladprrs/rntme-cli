import type { Project } from '../schemas/entities.js';
import type { Result, PlatformError } from '../types/result.js';

export interface ProjectRepo {
  create(row: { id: string; orgId: string; slug: string; displayName: string }): Promise<Result<Project, PlatformError>>;
  findBySlug(orgId: string, slug: string): Promise<Result<Project | null, PlatformError>>;
  findById(orgId: string, id: string): Promise<Result<Project | null, PlatformError>>;
  list(orgId: string, opts: { includeArchived: boolean }): Promise<Result<readonly Project[], PlatformError>>;
  patch(orgId: string, id: string, patch: { displayName: string }): Promise<Result<Project, PlatformError>>;
  archive(orgId: string, id: string): Promise<Result<Project, PlatformError>>;
  countServices(orgId: string, id: string): Promise<Result<number, PlatformError>>;
}
