import { ok, err, isOk, type PlatformError } from '../types/result.js';
import type {
  Organization,
  Account,
  MembershipMirror,
  Project,
  Service,
  ArtifactVersion,
  ArtifactTag,
  ApiToken,
  AuditLogEntry,
} from '../schemas/entities.js';
import type { OrganizationRepo } from '../repos/org-repo.js';
import type { AccountRepo } from '../repos/account-repo.js';
import type { MembershipMirrorRepo } from '../repos/membership-mirror-repo.js';
import type { WorkosEventLogRepo } from '../repos/workos-event-log-repo.js';
import type { ProjectRepo } from '../repos/project-repo.js';
import type { ServiceRepo } from '../repos/service-repo.js';
import type { ArtifactRepo } from '../repos/artifact-repo.js';
import type { TagRepo } from '../repos/tag-repo.js';
import type { TokenRepo } from '../repos/token-repo.js';
import type { AuditRepo } from '../repos/audit-repo.js';
import type { OutboxRepo } from '../repos/outbox-repo.js';
import type { BlobStore } from '../blob/store.js';

function notFound(code: PlatformError['code'], message: string): PlatformError {
  return { code, message };
}

export class FakeStore {
  public orgs = new Map<string, Organization>();
  public accounts = new Map<string, Account>();
  public memberships = new Map<string, MembershipMirror>();
  public projectsByOrg = new Map<string, Project[]>();
  public servicesByProject = new Map<string, Service[]>();
  public versionsByService = new Map<string, ArtifactVersion[]>();
  public tagsByService = new Map<string, ArtifactTag[]>();
  public tokens = new Map<string, ApiToken>();
  public audit: AuditLogEntry[] = [];
  public outbox: { id: bigint; eventType: string; payload: Record<string, unknown>; deliveredAt: Date | null }[] = [];
  public workosEvents = new Set<string>();
  public blobs = new Map<string, Buffer>();
  /** Alias for `blobs`; reads the same map so tests can spell it either way. */
  public get uploads(): Map<string, Buffer> {
    return this.blobs;
  }

  private autoId = 1;
  private now = () => new Date();
  private nextOutboxId = 1n;

  async seedOrg(args: { slug: string; workosOrganizationId: string; displayName: string }): Promise<Organization> {
    const o: Organization = {
      id: `org-${this.autoId++}`,
      workosOrganizationId: args.workosOrganizationId,
      slug: args.slug,
      displayName: args.displayName,
      archivedAt: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.orgs.set(o.id, o);
    return o;
  }

  async seedAccount(args: { workosUserId: string; displayName: string; email: string | null }): Promise<Account> {
    const a: Account = {
      id: `acc-${this.autoId++}`,
      workosUserId: args.workosUserId,
      email: args.email,
      displayName: args.displayName,
      deletedAt: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.accounts.set(a.id, a);
    return a;
  }

  readonly organizations: OrganizationRepo = {
    findById: async (id) => ok(this.orgs.get(id) ?? null),
    findBySlug: async (slug) => ok([...this.orgs.values()].find((o) => o.slug === slug) ?? null),
    findByWorkosId: async (wid) => ok([...this.orgs.values()].find((o) => o.workosOrganizationId === wid) ?? null),
    listForAccount: async (accountId) => {
      const ids = new Set(
        [...this.memberships.values()].filter((m) => m.accountId === accountId).map((m) => m.orgId),
      );
      return ok([...this.orgs.values()].filter((o) => ids.has(o.id)));
    },
    upsertFromWorkos: async (a) => {
      const existing = [...this.orgs.values()].find((o) => o.workosOrganizationId === a.workosOrganizationId);
      if (existing) {
        const updated = { ...existing, slug: a.slug, displayName: a.displayName, updatedAt: this.now() };
        this.orgs.set(existing.id, updated);
        return ok(updated);
      }
      const o = await this.seedOrg(a);
      return ok(o);
    },
    archive: async (id) => {
      this.orgs.delete(id);
      return ok(undefined);
    },
  };

  readonly accountsRepo: AccountRepo = {
    findById: async (id) => ok(this.accounts.get(id) ?? null),
    findByWorkosUserId: async (wid) => ok([...this.accounts.values()].find((a) => a.workosUserId === wid) ?? null),
    upsertFromWorkos: async (a) => {
      const existing = [...this.accounts.values()].find((x) => x.workosUserId === a.workosUserId);
      if (existing) {
        const u = { ...existing, email: a.email, displayName: a.displayName, updatedAt: this.now() };
        this.accounts.set(existing.id, u);
        return ok(u);
      }
      return ok(await this.seedAccount(a));
    },
    markDeleted: async (wid) => {
      const x = [...this.accounts.values()].find((a) => a.workosUserId === wid);
      if (x) this.accounts.set(x.id, { ...x, deletedAt: this.now() });
      return ok(undefined);
    },
  };

  readonly membershipMirror: MembershipMirrorRepo = {
    find: async (o, a) => ok(this.memberships.get(`${o}:${a}`) ?? null),
    upsert: async (row) => {
      const m: MembershipMirror = { ...row, updatedAt: this.now() };
      this.memberships.set(`${row.orgId}:${row.accountId}`, m);
      return ok(m);
    },
    delete: async (o, a) => {
      this.memberships.delete(`${o}:${a}`);
      return ok(undefined);
    },
    listForAccount: async (a) => ok([...this.memberships.values()].filter((m) => m.accountId === a)),
  };

  readonly workosEventLog: WorkosEventLogRepo = {
    hasProcessed: async (id) => ok(this.workosEvents.has(id)),
    markProcessed: async (eventId, _eventType) => {
      this.workosEvents.add(eventId);
      return ok(undefined);
    },
  };

  readonly projects: ProjectRepo = {
    create: async (r) => {
      const list = this.projectsByOrg.get(r.orgId) ?? [];
      if (list.some((p) => p.slug === r.slug && p.archivedAt === null)) {
        return err([notFound('PLATFORM_CONFLICT_SLUG_TAKEN', `project slug ${r.slug} taken`)]);
      }
      const p: Project = { ...r, archivedAt: null, createdAt: this.now(), updatedAt: this.now() };
      this.projectsByOrg.set(r.orgId, [...list, p]);
      return ok(p);
    },
    findBySlug: async (o, s) => ok((this.projectsByOrg.get(o) ?? []).find((p) => p.slug === s) ?? null),
    findById: async (o, id) => ok((this.projectsByOrg.get(o) ?? []).find((p) => p.id === id) ?? null),
    list: async (o, opts) => {
      const all = this.projectsByOrg.get(o) ?? [];
      return ok(opts.includeArchived ? all : all.filter((p) => !p.archivedAt));
    },
    patch: async (o, id, patch) => {
      const list = this.projectsByOrg.get(o) ?? [];
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) return err([notFound('PLATFORM_TENANCY_PROJECT_NOT_FOUND', id)]);
      const u = { ...list[idx]!, displayName: patch.displayName, updatedAt: this.now() };
      list[idx] = u;
      this.projectsByOrg.set(o, list);
      return ok(u);
    },
    archive: async (o, id) => {
      const list = this.projectsByOrg.get(o) ?? [];
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0) return err([notFound('PLATFORM_TENANCY_PROJECT_NOT_FOUND', id)]);
      const u = { ...list[idx]!, archivedAt: this.now(), updatedAt: this.now() };
      list[idx] = u;
      this.projectsByOrg.set(o, list);
      return ok(u);
    },
    countServices: async (_o, id) => ok((this.servicesByProject.get(id) ?? []).filter((s) => !s.archivedAt).length),
  };

  readonly services: ServiceRepo = {
    create: async (r) => {
      const list = this.servicesByProject.get(r.projectId) ?? [];
      if (list.some((s) => s.slug === r.slug && !s.archivedAt)) {
        return err([notFound('PLATFORM_CONFLICT_SLUG_TAKEN', `service slug ${r.slug} taken`)]);
      }
      const s: Service = { ...r, archivedAt: null, createdAt: this.now(), updatedAt: this.now() };
      this.servicesByProject.set(r.projectId, [...list, s]);
      return ok(s);
    },
    findBySlug: async (pid, slug) => ok((this.servicesByProject.get(pid) ?? []).find((s) => s.slug === slug) ?? null),
    findById: async (o, id) => {
      for (const list of this.servicesByProject.values()) {
        const f = list.find((s) => s.id === id && s.orgId === o);
        if (f) return ok(f);
      }
      return ok(null);
    },
    list: async (_o, pid) => ok(this.servicesByProject.get(pid) ?? []),
    patch: async (o, id, patch) => {
      for (const [pid, list] of this.servicesByProject) {
        const idx = list.findIndex((s) => s.id === id && s.orgId === o);
        if (idx >= 0) {
          const u = { ...list[idx]!, displayName: patch.displayName, updatedAt: this.now() };
          list[idx] = u;
          this.servicesByProject.set(pid, list);
          return ok(u);
        }
      }
      return err([notFound('PLATFORM_TENANCY_SERVICE_NOT_FOUND', id)]);
    },
    archive: async (o, id) => {
      for (const [pid, list] of this.servicesByProject) {
        const idx = list.findIndex((s) => s.id === id && s.orgId === o);
        if (idx >= 0) {
          const u = { ...list[idx]!, archivedAt: this.now(), updatedAt: this.now() };
          list[idx] = u;
          this.servicesByProject.set(pid, list);
          return ok(u);
        }
      }
      return err([notFound('PLATFORM_TENANCY_SERVICE_NOT_FOUND', id)]);
    },
    detailWithLatest: async (o, id) => {
      const svcR = await this.services.findById(o, id);
      if (!isOk(svcR)) return svcR;
      if (!svcR.value) return err([notFound('PLATFORM_TENANCY_SERVICE_NOT_FOUND', id)]);
      const versions = this.versionsByService.get(id) ?? [];
      const latestVersion = versions.length ? versions[versions.length - 1]! : null;
      const tags = this.tagsByService.get(id) ?? [];
      return ok({ service: svcR.value, latestVersion, tags });
    },
  };

  readonly artifacts: ArtifactRepo = {
    findByDigest: async (sid, d) => {
      const list = this.versionsByService.get(sid) ?? [];
      return ok(list.find((v) => v.bundleDigest === d) ?? null);
    },
    latestSeq: async (sid) => {
      const list = this.versionsByService.get(sid) ?? [];
      return ok(list.length ? list[list.length - 1]!.seq : 0);
    },
    publish: async (args) => {
      const list = this.versionsByService.get(args.serviceId) ?? [];
      const dup = list.find((v) => v.bundleDigest === args.row.bundleDigest);
      if (dup) return ok(dup);
      const latest = list.length ? list[list.length - 1]!.seq : 0;
      if (args.expectedPreviousSeq !== undefined && args.expectedPreviousSeq !== latest) {
        return err([
          notFound(
            'PLATFORM_CONCURRENCY_VERSION_CONFLICT',
            `expected ${args.expectedPreviousSeq} but latest is ${latest}`,
          ),
        ]);
      }
      const v: ArtifactVersion = {
        ...(args.row as Omit<ArtifactVersion, 'seq' | 'publishedAt'>),
        seq: latest + 1,
        publishedAt: this.now(),
      };
      this.versionsByService.set(args.serviceId, [...list, v]);
      this.outbox.push({
        id: this.nextOutboxId++,
        eventType: 'artifact.version.published',
        payload: args.outboxPayload,
        deliveredAt: null,
      });
      this.audit.push({
        id: BigInt(this.audit.length + 1),
        orgId: v.orgId,
        actorAccountId: args.auditActorAccountId,
        actorTokenId: args.auditActorTokenId,
        action: 'version.published',
        resourceKind: 'version',
        resourceId: v.id,
        payload: { seq: v.seq },
        createdAt: this.now(),
      });
      const tags = this.tagsByService.get(args.serviceId) ?? [];
      for (const t of args.moveTags) {
        const idx = tags.findIndex((x) => x.name === t.name);
        const tag: ArtifactTag = {
          serviceId: args.serviceId,
          name: t.name,
          versionId: v.id,
          updatedAt: this.now(),
          updatedByAccountId: t.updatedByAccountId,
        };
        if (idx >= 0) tags[idx] = tag;
        else tags.push(tag);
        this.audit.push({
          id: BigInt(this.audit.length + 1),
          orgId: v.orgId,
          actorAccountId: args.auditActorAccountId,
          actorTokenId: args.auditActorTokenId,
          action: 'tag.moved',
          resourceKind: 'tag',
          resourceId: t.name,
          payload: { versionSeq: v.seq },
          createdAt: this.now(),
        });
      }
      this.tagsByService.set(args.serviceId, tags);
      return ok(v);
    },
    listBySeq: async (sid, { limit, cursor }) => {
      let list = this.versionsByService.get(sid) ?? [];
      if (cursor !== undefined) list = list.filter((v) => v.seq < cursor);
      return ok([...list].reverse().slice(0, limit));
    },
    getBySeq: async (sid, seq) => {
      const list = this.versionsByService.get(sid) ?? [];
      return ok(list.find((v) => v.seq === seq) ?? null);
    },
  };

  readonly tags: TagRepo = {
    list: async (sid) => ok(this.tagsByService.get(sid) ?? []),
    move: async (a) => {
      const list = this.tagsByService.get(a.serviceId) ?? [];
      const idx = list.findIndex((t) => t.name === a.name);
      const t: ArtifactTag = {
        serviceId: a.serviceId,
        name: a.name,
        versionId: a.versionId,
        updatedAt: this.now(),
        updatedByAccountId: a.updatedByAccountId,
      };
      if (idx >= 0) list[idx] = t;
      else list.push(t);
      this.tagsByService.set(a.serviceId, list);
      return ok(t);
    },
    delete: async (sid, name, _actorAccountId) => {
      const list = (this.tagsByService.get(sid) ?? []).filter((t) => t.name !== name);
      this.tagsByService.set(sid, list);
      return ok(undefined);
    },
  };

  readonly tokensRepo: TokenRepo = {
    create: async (r) => {
      const t: ApiToken = {
        ...r,
        tokenHash: new Uint8Array(r.tokenHash),
        scopes: [...r.scopes],
        lastUsedAt: null,
        expiresAt: r.expiresAt,
        revokedAt: null,
        createdAt: this.now(),
      };
      this.tokens.set(t.id, t);
      return ok(t);
    },
    findByPrefix: async (p) => ok([...this.tokens.values()].find((t) => t.prefix === p && !t.revokedAt) ?? null),
    list: async (o) => ok([...this.tokens.values()].filter((t) => t.orgId === o)),
    revoke: async (_o, id) => {
      const t = this.tokens.get(id);
      if (t) this.tokens.set(id, { ...t, revokedAt: this.now() });
      return ok(undefined);
    },
    touchLastUsed: async (id) => {
      const t = this.tokens.get(id);
      if (t) this.tokens.set(id, { ...t, lastUsedAt: this.now() });
      return ok(undefined);
    },
  };

  readonly auditRepo: AuditRepo = {
    list: async (o, opts) => {
      let list = this.audit.filter((a) => a.orgId === o);
      if (opts.resourceKind) list = list.filter((a) => a.resourceKind === opts.resourceKind);
      if (opts.actorAccountId) list = list.filter((a) => a.actorAccountId === opts.actorAccountId);
      if (opts.action) list = list.filter((a) => a.action === opts.action);
      if (opts.since) list = list.filter((a) => a.createdAt >= opts.since!);
      return ok(list.slice(-opts.limit).reverse());
    },
  };

  readonly outboxRepo: OutboxRepo = {
    pending: async (limit) =>
      ok(
        this.outbox
          .filter((o) => o.deliveredAt === null)
          .slice(0, limit)
          .map((o) => ({ id: o.id, eventType: o.eventType, payload: o.payload })),
      ),
    markDelivered: async (id) => {
      const r = this.outbox.find((o) => o.id === id);
      if (r) r.deliveredAt = this.now();
      return ok(undefined);
    },
  };

  readonly blob: BlobStore = {
    putIfAbsent: async (key, body) => {
      if (!this.blobs.has(key)) this.blobs.set(key, Buffer.from(body));
      return ok(undefined);
    },
    presignedGet: async (key, _expiresSeconds) => ok(`memory://${key}`),
    getJson: async <T = unknown>(key: string) => {
      const b = this.blobs.get(key);
      if (!b) return err([notFound('PLATFORM_INTERNAL', `blob ${key} missing`)]);
      return ok(JSON.parse(b.toString('utf8')) as T);
    },
  };
}
