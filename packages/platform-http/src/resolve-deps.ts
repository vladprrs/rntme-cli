import type { PoolClient } from 'pg';
import {
  PgOrganizationRepo,
  PgAccountRepo,
  PgMembershipMirrorRepo,
  PgWorkosEventLogRepo,
  PgProjectRepo,
  PgProjectVersionRepo,
  PgDeployTargetRepo,
  PgDeploymentRepo,
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
  ProjectVersionRepo,
  DeployTargetRepo,
  DeploymentRepo,
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
  projectVersions: ProjectVersionRepo;
  deployTargets: DeployTargetRepo;
  deployments: DeploymentRepo;
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
    projectVersions: new PgProjectVersionRepo(tx),
    deployTargets: new PgDeployTargetRepo(tx),
    deployments: new PgDeploymentRepo(tx),
    tokens: new PgTokenRepo(tx),
    audit: new PgAuditRepo(tx),
    outbox: new PgOutboxRepo(tx),
  };
}
