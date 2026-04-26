import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { isOk } from '@rntme-cli/platform-core';
import { withTransaction } from '../../src/pg/tx.js';
import { PgDeploymentRepo } from '../../src/repos/pg-deployment-repo.js';
import { integrationContainersAvailable } from './docker-available.js';
import {
  startPostgres,
  stopPostgres,
  resetSchema,
  type PgHandles,
} from './harness.js';

const shouldRun = integrationContainersAvailable();
const d = shouldRun ? describe : describe.skip;

d('PgDeploymentRepo', () => {
  let h: PgHandles;
  let orgId: string;
  let accountId: string;
  let projectId: string;
  let versionId: string;
  let targetId: string;

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
    projectId = randomUUID();
    versionId = randomUUID();
    targetId = randomUUID();

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
      `INSERT INTO deploy_target (
         id, org_id, slug, display_name, kind, dokploy_url,
         allow_create_project, api_token_ciphertext, api_token_nonce,
         api_token_key_version, event_bus_config, policy_values, is_default
       )
       VALUES ($1, $2, 'prod', 'Production', 'dokploy', 'https://dokploy.example.com',
         false, $3, $4, 1, $5, $6, true)`,
      [
        targetId,
        orgId,
        Buffer.from('token-v1'),
        Buffer.from('nonce-v1'),
        { kind: 'kafka', brokers: ['kafka:9092'], topicPrefix: 'rntme' },
        { deploy: { maxServices: 12 } },
      ],
    );
  });

  it('creates and gets a deployment by id with an audit row', async () => {
    const deploymentId = randomUUID();

    const created = await createDeployment(deploymentId, { region: 'eu' });

    expect(created).toMatchObject({
      id: deploymentId,
      projectId,
      orgId,
      projectVersionId: versionId,
      targetId,
      status: 'queued',
      configOverrides: { region: 'eu' },
      renderedPlanDigest: null,
      applyResult: null,
      verificationReport: null,
      warnings: [],
      errorCode: null,
      errorMessage: null,
      startedByAccountId: accountId,
      startedAt: null,
      finishedAt: null,
      lastHeartbeatAt: null,
    });
    expect(created.queuedAt).toBeInstanceOf(Date);

    const found = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      return repo.getById(deploymentId);
    });

    expect(isOk(found)).toBe(true);
    expect(isOk(found) ? found.value : undefined).toMatchObject({
      id: deploymentId,
      status: 'queued',
      configOverrides: { region: 'eu' },
    });
    await expectAuditActions(['deployment.created']);
  });

  it('transitions queued deployments to running and rejects a repeated running transition', async () => {
    const deploymentId = randomUUID();
    await createDeployment(deploymentId);
    const startedAt = new Date('2026-04-26T10:00:00.000Z');

    const running = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      return repo.transition(deploymentId, 'running', { startedAt });
    });

    expect(isOk(running)).toBe(true);
    const afterRunning = await getDeployment(deploymentId);
    expect(afterRunning.status).toBe('running');
    expect(afterRunning.startedAt?.toISOString()).toBe(startedAt.toISOString());
    expect(afterRunning.lastHeartbeatAt?.toISOString()).toBe(
      startedAt.toISOString(),
    );

    const repeated = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      return repo.transition(deploymentId, 'running', {
        startedAt: new Date('2026-04-26T11:00:00.000Z'),
      });
    });

    expect(repeated.ok).toBe(false);
    expect(repeated.ok ? undefined : repeated.errors[0]?.code).toBe(
      'DEPLOYMENT_INVALID_TRANSITION',
    );
    const afterRepeated = await getDeployment(deploymentId);
    expect(afterRepeated.startedAt?.toISOString()).toBe(
      startedAt.toISOString(),
    );
  });

  it('sets render/apply fields and finalizes an active deployment', async () => {
    const deploymentId = randomUUID();
    await createDeployment(deploymentId);

    const result = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      const digest = await repo.setRenderedDigest(
        deploymentId,
        'sha256:rendered',
      );
      if (!isOk(digest)) return digest;
      const apply = await repo.setApplyResult(deploymentId, { app: 'created' });
      if (!isOk(apply)) return apply;
      return repo.finalize(deploymentId, {
        status: 'succeeded_with_warnings',
        verificationReport: {
          checks: [
            {
              name: 'root',
              url: 'https://app.example.com',
              status: 200,
              latencyMs: 12,
              ok: true,
            },
          ],
          ok: true,
          partialOk: false,
        },
        warnings: ['slow-start'],
      });
    });

    expect(isOk(result)).toBe(true);
    const finalized = await getDeployment(deploymentId);
    expect(finalized).toMatchObject({
      status: 'succeeded_with_warnings',
      renderedPlanDigest: 'sha256:rendered',
      applyResult: { app: 'created' },
      verificationReport: {
        checks: [
          {
            name: 'root',
            url: 'https://app.example.com',
            status: 200,
            latencyMs: 12,
            ok: true,
          },
        ],
        ok: true,
        partialOk: false,
      },
      warnings: ['slow-start'],
      errorCode: null,
      errorMessage: null,
    });
    expect(finalized.finishedAt).toBeInstanceOf(Date);
  });

  it('leaves an already-terminal deployment unchanged when finalized again', async () => {
    const deploymentId = randomUUID();
    await createDeployment(deploymentId);
    await finalizeDeployment(deploymentId, {
      status: 'failed',
      errorCode: 'FIRST',
      errorMessage: 'first failure',
      warnings: ['first'],
    });
    const terminal = await getDeployment(deploymentId);

    const second = await finalizeDeployment(deploymentId, {
      status: 'succeeded',
      applyResult: { changed: true },
      warnings: ['second'],
    });

    expect(isOk(second)).toBe(true);
    const unchanged = await getDeployment(deploymentId);
    expect(unchanged).toMatchObject({
      status: 'failed',
      errorCode: 'FIRST',
      errorMessage: 'first failure',
      warnings: ['first'],
      applyResult: null,
    });
    expect(unchanged.finishedAt?.toISOString()).toBe(
      terminal.finishedAt?.toISOString(),
    );
  });

  it('touches a running deployment heartbeat', async () => {
    const deploymentId = randomUUID();
    await createDeployment(deploymentId);
    const oldHeartbeat = new Date('2026-04-26T09:00:00.000Z');
    await h.pool.query(
      `UPDATE deployment SET status='running', started_at=$1, last_heartbeat_at=$1 WHERE id=$2`,
      [oldHeartbeat, deploymentId],
    );

    const touched = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      return repo.touchHeartbeat(deploymentId);
    });

    expect(isOk(touched)).toBe(true);
    const row = await getDeployment(deploymentId);
    expect(row.lastHeartbeatAt?.getTime()).toBeGreaterThan(
      oldHeartbeat.getTime(),
    );
  });

  it('finds running deployments with null or stale heartbeats', async () => {
    const nullHeartbeatId = randomUUID();
    const oldHeartbeatId = randomUUID();
    const freshHeartbeatId = randomUUID();
    const queuedId = randomUUID();
    await createDeployment(nullHeartbeatId);
    await createDeployment(oldHeartbeatId);
    await createDeployment(freshHeartbeatId);
    await createDeployment(queuedId);
    await h.pool.query(
      `UPDATE deployment
       SET status='running', started_at=now(), last_heartbeat_at=NULL
       WHERE id=$1`,
      [nullHeartbeatId],
    );
    await h.pool.query(
      `UPDATE deployment
       SET status='running', started_at=now(), last_heartbeat_at=now() - interval '2 minutes'
       WHERE id=$1`,
      [oldHeartbeatId],
    );
    await h.pool.query(
      `UPDATE deployment
       SET status='running', started_at=now(), last_heartbeat_at=now()
       WHERE id=$1`,
      [freshHeartbeatId],
    );

    const stale = await new PgDeploymentRepo(h.pool).findStaleRunning(60);

    expect(isOk(stale)).toBe(true);
    expect(isOk(stale) ? stale.value : []).toEqual(
      expect.arrayContaining([
        { id: nullHeartbeatId, orgId },
        { id: oldHeartbeatId, orgId },
      ]),
    );
    expect(isOk(stale) ? stale.value.map((row) => row.id) : []).not.toContain(
      freshHeartbeatId,
    );
    expect(isOk(stale) ? stale.value.map((row) => row.id) : []).not.toContain(
      queuedId,
    );
  });

  it('appends truncated logs and reads them with an incremental cursor', async () => {
    const deploymentId = randomUUID();
    await createDeployment(deploymentId);
    const longMessage = 'a'.repeat(9_000);

    const appended = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      const first = await repo.appendLog({
        deploymentId,
        orgId,
        level: 'info',
        step: 'plan',
        message: 'started',
      });
      if (!isOk(first)) return first;
      const second = await repo.appendLog({
        deploymentId,
        orgId,
        level: 'warn',
        step: 'apply',
        message: longMessage,
      });
      if (!isOk(second)) return second;
      return repo.appendLog({
        deploymentId,
        orgId,
        level: 'error',
        step: 'verify',
        message: 'failed',
      });
    });
    expect(isOk(appended)).toBe(true);

    const firstPage = await readLogs(deploymentId, 0, 2);
    expect(firstPage.lines).toHaveLength(2);
    expect(firstPage.lines[0]).toMatchObject({
      deploymentId,
      orgId,
      level: 'info',
      step: 'plan',
      message: 'started',
    });
    expect(Buffer.byteLength(firstPage.lines[1]?.message ?? '', 'utf8')).toBeLessThanOrEqual(
      8 * 1024,
    );
    expect(firstPage.lines[1]?.message.endsWith('... (truncated)')).toBe(true);
    expect(firstPage.lastLineId).toBe(firstPage.lines[1]?.id);

    const secondPage = await readLogs(deploymentId, firstPage.lastLineId, 10);
    expect(secondPage.lines).toHaveLength(1);
    expect(secondPage.lines[0]).toMatchObject({
      level: 'error',
      step: 'verify',
      message: 'failed',
    });
    expect(secondPage.lastLineId).toBe(secondPage.lines[0]?.id);

    const emptyPage = await readLogs(deploymentId, secondPage.lastLineId, 10);
    expect(emptyPage.lines).toHaveLength(0);
    expect(emptyPage.lastLineId).toBe(secondPage.lastLineId);
  });

  async function createDeployment(
    id: string,
    configOverrides: Record<string, unknown> = {},
  ) {
    const result = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      return repo.create({
        row: {
          id,
          projectId,
          orgId,
          projectVersionId: versionId,
          targetId,
          configOverrides,
          startedByAccountId: accountId,
        },
        auditActorAccountId: accountId,
        auditActorTokenId: null,
      });
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result))
      throw new Error(result.errors.map((e) => e.message).join(', '));
    return result.value;
  }

  async function getDeployment(id: string) {
    const result = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      return repo.getById(id);
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || !result.value)
      throw new Error(`deployment not found: ${id}`);
    return result.value;
  }

  async function finalizeDeployment(
    id: string,
    args: Parameters<PgDeploymentRepo['finalize']>[1],
  ) {
    return withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      return repo.finalize(id, args);
    });
  }

  async function readLogs(
    deploymentId: string,
    sinceLineId: number,
    limit: number,
  ) {
    const result = await withTransaction(h.appPool, orgId, async (client) => {
      const repo = new PgDeploymentRepo(client);
      return repo.readLogs({ deploymentId, sinceLineId, limit });
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result))
      throw new Error(result.errors.map((e) => e.message).join(', '));
    return result.value;
  }

  async function expectAuditActions(actions: string[]) {
    const rows = await h.pool.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE org_id=$1 ORDER BY id ASC`,
      [orgId],
    );
    expect(rows.rows.map((row) => row.action)).toEqual(actions);
  }
});
