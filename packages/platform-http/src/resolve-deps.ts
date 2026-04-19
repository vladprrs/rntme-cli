import type { PoolClient } from 'pg';
import {
  PgOrganizationRepo,
  PgAccountRepo,
  PgMembershipMirrorRepo,
  PgWorkosEventLogRepo,
  PgProjectRepo,
  PgServiceRepo,
  PgArtifactRepo,
  PgTagRepo,
  PgTokenRepo,
  PgAuditRepo,
  PgOutboxRepo,
} from '@rntme-cli/platform-storage';
import type {
  OrganizationRepo,
  AccountRepo,
  MembershipMirrorRepo,
  WorkosEventLogRepo,
  ProjectRepo,
  ServiceRepo,
  ArtifactRepo,
  TagRepo,
  TokenRepo,
  AuditRepo,
  OutboxRepo,
} from '@rntme-cli/platform-core';

export type RequestRepos = {
  organizations: OrganizationRepo;
  accounts: AccountRepo;
  memberships: MembershipMirrorRepo;
  workosEventLog: WorkosEventLogRepo;
  projects: ProjectRepo;
  services: ServiceRepo;
  artifacts: ArtifactRepo;
  tags: TagRepo;
  tokens: TokenRepo;
  audit: AuditRepo;
  outbox: OutboxRepo;
};

export function resolveDeps(tx: PoolClient): RequestRepos {
  return {
    organizations: new PgOrganizationRepo(tx),
    accounts: new PgAccountRepo(tx),
    memberships: new PgMembershipMirrorRepo(tx),
    workosEventLog: new PgWorkosEventLogRepo(tx),
    projects: new PgProjectRepo(tx),
    services: new PgServiceRepo(tx),
    artifacts: new PgArtifactRepo(tx),
    tags: new PgTagRepo(tx),
    tokens: new PgTokenRepo(tx),
    audit: new PgAuditRepo(tx),
    outbox: new PgOutboxRepo(tx),
  };
}
