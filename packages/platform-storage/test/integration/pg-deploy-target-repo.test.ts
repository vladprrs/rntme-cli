import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { isOk } from '@rntme-cli/platform-core';
import { withTransaction } from '../../src/pg/tx.js';
import { PgDeployTargetRepo } from '../../src/repos/pg-deploy-target-repo.js';
import { integrationContainersAvailable } from './docker-available.js';
import { startPostgres, stopPostgres, resetSchema, type PgHandles } from './harness.js';

const shouldRun = integrationContainersAvailable();
const d = shouldRun ? describe : describe.skip;

const EVENT_BUS = {
  kind: 'kafka' as const,
  brokers: ['kafka:9092'],
  topicPrefix: 'rntme',
};

const POLICY_VALUES = {
  deploy: { maxServices: 12 },
};

d('PgDeployTargetRepo', () => {
  let h: PgHandles;
  let orgId: string;
  let accountId: string;

  beforeAll(async () => {
    h = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    if (h) await stopPostgres(h);
  });

  beforeEach(async () => {
    await resetSchema(h.pool);
    orgId = randomUUID();
    accountId = randomUUID();
    await h.pool.query(
      `INSERT INTO organization (id, workos_organization_id, slug, display_name)
       VALUES ($1, $2, 'org', 'Org')`,
      [orgId, `org_${orgId}`],
    );
    await h.pool.query(
      `INSERT INTO account (id, workos_user_id, email, display_name)
       VALUES ($1, $2, 'owner@example.com', 'Owner')`,
      [accountId, `user_${accountId}`],
    );
  });

  it('creates and reads a target by slug with redacted token and audit row', async () => {
    const targetId = randomUUID();

    const created = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.create({
        row: targetRow({ id: targetId, slug: 'prod', isDefault: true }),
        auditActorAccountId: accountId,
        auditActorTokenId: null,
      });
    });

    if (!isOk(created))
      throw new Error(created.errors.map((e) => e.message).join(', '));
    expect(isOk(created)).toBe(true);
    expect(created.value).toMatchObject({
      id: targetId,
      orgId,
      slug: 'prod',
      displayName: 'Production',
      kind: 'dokploy',
      publicBaseUrl: 'https://notes.example.com',
      apiTokenRedacted: '***',
      isDefault: true,
      eventBus: EVENT_BUS,
      policyValues: POLICY_VALUES,
    });
    expect(Object.keys(created.value)).not.toContain('apiTokenCiphertext');
    expect(Object.keys(created.value)).not.toContain('apiTokenNonce');
    expect(Object.keys(created.value)).not.toContain('apiTokenKeyVersion');

    const found = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.getBySlug(orgId, 'prod');
    });

    expect(isOk(found)).toBe(true);
    expect(isOk(found) ? found.value?.apiTokenRedacted : undefined).toBe('***');
    await expectAuditActions(['deploy_target.created']);
  });

  it('updates mutable fields without changing the stored api token secret', async () => {
    const targetId = randomUUID();
    await createTarget(targetRow({ id: targetId, slug: 'prod' }));

    const updated = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.update({
        orgId,
        slug: 'prod',
        patch: {
          displayName: 'Prod EU',
          dokployUrl: 'https://dokploy-eu.example.com',
          publicBaseUrl: 'https://notes-eu.example.com',
          dokployProjectId: 'dokploy-project-eu',
          dokployProjectName: null,
          allowCreateProject: false,
          eventBusConfig: { ...EVENT_BUS, topicPrefix: 'eu' },
          policyValues: { deploy: { maxServices: 20 } },
        },
        auditActorAccountId: accountId,
        auditActorTokenId: null,
      });
    });

    expect(isOk(updated)).toBe(true);
    if (!isOk(updated)) return;
    expect(updated.value).toMatchObject({
      displayName: 'Prod EU',
      dokployUrl: 'https://dokploy-eu.example.com',
      publicBaseUrl: 'https://notes-eu.example.com',
      dokployProjectId: 'dokploy-project-eu',
      dokployProjectName: null,
      allowCreateProject: false,
      apiTokenRedacted: '***',
      eventBus: { ...EVENT_BUS, topicPrefix: 'eu' },
      policyValues: { deploy: { maxServices: 20 } },
    });

    const withSecret = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.getWithSecretById(targetId);
    });
    expect(isOk(withSecret)).toBe(true);
    expect(isOk(withSecret) ? withSecret.value?.apiTokenCiphertext.toString('utf8') : undefined).toBe('token-v1');
    expect(isOk(withSecret) ? withSecret.value?.apiTokenNonce.toString('utf8') : undefined).toBe('nonce-v1');
    expect(isOk(withSecret) ? withSecret.value?.apiTokenKeyVersion : undefined).toBe(1);
    await expectAuditActions(['deploy_target.created', 'deploy_target.updated']);
  });

  it('rotates the api token secret and returns a redacted target', async () => {
    const targetId = randomUUID();
    await createTarget(targetRow({ id: targetId, slug: 'prod' }));

    const rotated = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.rotateApiToken({
        orgId,
        slug: 'prod',
        ciphertext: Buffer.from('token-v2'),
        nonce: Buffer.from('nonce-v2'),
        keyVersion: 2,
        auditActorAccountId: accountId,
        auditActorTokenId: null,
      });
    });

    expect(isOk(rotated)).toBe(true);
    if (!isOk(rotated)) return;
    expect(rotated.value.apiTokenRedacted).toBe('***');
    expect(Object.keys(rotated.value)).not.toContain('apiTokenCiphertext');

    const withSecret = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.getWithSecretById(targetId);
    });
    expect(isOk(withSecret)).toBe(true);
    expect(isOk(withSecret) ? withSecret.value?.apiTokenCiphertext.toString('utf8') : undefined).toBe('token-v2');
    expect(isOk(withSecret) ? withSecret.value?.apiTokenNonce.toString('utf8') : undefined).toBe('nonce-v2');
    expect(isOk(withSecret) ? withSecret.value?.apiTokenKeyVersion : undefined).toBe(2);
    await expectAuditActions(['deploy_target.created', 'deploy_target.api_token_rotated']);
  });

  it('atomically swaps the default target', async () => {
    await createTarget(targetRow({ id: randomUUID(), slug: 'prod', isDefault: true }));
    await createTarget(targetRow({ id: randomUUID(), slug: 'stage', displayName: 'Stage' }));

    const result = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.setDefault({
        orgId,
        slug: 'stage',
        auditActorAccountId: accountId,
        auditActorTokenId: null,
      });
    });

    expect(isOk(result)).toBe(true);
    expect(isOk(result) ? result.value.isDefault : undefined).toBe(true);

    const listed = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.list(orgId);
    });
    expect(isOk(listed)).toBe(true);
    if (!isOk(listed)) return;
    expect(listed.value.map((target) => [target.slug, target.isDefault])).toEqual([
      ['prod', false],
      ['stage', true],
    ]);

    const defaultTarget = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.getDefault(orgId);
    });
    expect(isOk(defaultTarget)).toBe(true);
    expect(isOk(defaultTarget) ? defaultTarget.value?.slug : undefined).toBe('stage');
    await expectAuditActions([
      'deploy_target.created',
      'deploy_target.created',
      'deploy_target.set_default',
    ]);
  });

  it('deletes a target with no deployments and audits the delete', async () => {
    await createTarget(targetRow({ id: randomUUID(), slug: 'prod' }));

    const deleted = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.delete({
        orgId,
        slug: 'prod',
        auditActorAccountId: accountId,
        auditActorTokenId: null,
      });
    });

    expect(isOk(deleted)).toBe(true);
    const found = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.getBySlug(orgId, 'prod');
    });
    expect(isOk(found)).toBe(true);
    expect(isOk(found) ? found.value : undefined).toBeNull();
    await expectAuditActions(['deploy_target.created', 'deploy_target.deleted']);
  });

  it.each(['queued', 'running'] as const)(
    'rejects deleting a target with a %s deployment',
    async (status) => {
      const targetId = randomUUID();
      await createTarget(targetRow({ id: targetId, slug: 'prod' }));
      await seedDeployment({ targetId, status });

      const deleted = await withTransaction(h.appPool, orgId, async (client) => {
        const repo = new PgDeployTargetRepo(client);
        return repo.delete({
          orgId,
          slug: 'prod',
          auditActorAccountId: accountId,
          auditActorTokenId: null,
        });
      });

      expect(deleted.ok).toBe(false);
      expect(deleted.ok ? undefined : deleted.errors[0]?.code).toBe('DEPLOY_TARGET_IN_USE');

      const stillThere = await h.pool.query(`SELECT id FROM deploy_target WHERE id=$1`, [targetId]);
      expect(stillThere.rows).toHaveLength(1);
      await expectAuditActions(['deploy_target.created']);
    },
  );

  async function createTarget(row: ReturnType<typeof targetRow>) {
    const result = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeployTargetRepo(client);
      return repo.create({
        row,
        auditActorAccountId: accountId,
        auditActorTokenId: null,
      });
    });
    if (!isOk(result)) throw new Error(result.errors.map((e) => e.message).join(', '));
    expect(isOk(result)).toBe(true);
    return result.value;
  }

  async function seedDeployment(args: { targetId: string; status: 'queued' | 'running' }) {
    const projectId = randomUUID();
    const versionId = randomUUID();
    await h.pool.query(
      `INSERT INTO project (id, org_id, slug, display_name)
       VALUES ($1, $2, 'project', 'Project')`,
      [projectId, orgId],
    );
    await h.pool.query(
      `INSERT INTO project_version (
         id, org_id, project_id, seq, bundle_digest, bundle_blob_key,
         bundle_size_bytes, summary, uploaded_by_account_id
       )
       VALUES ($1, $2, $3, 1, 'sha256:abc', 'bundles/abc', 42, $4, $5)`,
      [versionId, orgId, projectId, {}, accountId],
    );
    await h.pool.query(
      `INSERT INTO deployment (
         id, org_id, project_id, project_version_id, target_id, status,
         config_overrides, warnings, started_by_account_id, started_at, last_heartbeat_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, '{}', '[]', $7, $8, $8)`,
      [
        randomUUID(),
        orgId,
        projectId,
        versionId,
        args.targetId,
        args.status,
        accountId,
        args.status === 'running' ? new Date() : null,
      ],
    );
  }

  async function expectAuditActions(actions: string[]) {
    const rows = await h.pool.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE org_id=$1 ORDER BY id ASC`,
      [orgId],
    );
    expect(rows.rows.map((row) => row.action)).toEqual(actions);
  }

  function targetRow(overrides: {
    id: string;
    slug: string;
    displayName?: string;
    isDefault?: boolean;
  }) {
    return {
      id: overrides.id,
      orgId,
      slug: overrides.slug,
      displayName: overrides.displayName ?? 'Production',
      kind: 'dokploy' as const,
      dokployUrl: 'https://dokploy.example.com',
      publicBaseUrl: 'https://notes.example.com',
      dokployProjectId: 'dokploy-project',
      dokployProjectName: null,
      allowCreateProject: false,
      apiTokenCiphertext: Buffer.from('token-v1'),
      apiTokenNonce: Buffer.from('nonce-v1'),
      apiTokenKeyVersion: 1,
      eventBusConfig: EVENT_BUS,
      policyValues: POLICY_VALUES,
      isDefault: overrides.isDefault ?? false,
    };
  }
});
