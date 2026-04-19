import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  unique,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { organization, account } from './identity.js';
import { service } from './projects.js';

export const artifactVersion = pgTable(
  'artifact_version',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => service.id),
    seq: integer('seq').notNull(),
    bundleDigest: text('bundle_digest').notNull(),
    previousVersionId: uuid('previous_version_id').references((): AnyPgColumn => artifactVersion.id),
    manifestDigest: text('manifest_digest').notNull(),
    pdmDigest: text('pdm_digest').notNull(),
    qsmDigest: text('qsm_digest').notNull(),
    graphIrDigest: text('graph_ir_digest').notNull(),
    bindingsDigest: text('bindings_digest').notNull(),
    uiDigest: text('ui_digest').notNull(),
    seedDigest: text('seed_digest').notNull(),
    validationSnapshot: jsonb('validation_snapshot').notNull(),
    publishedByAccountId: uuid('published_by_account_id')
      .notNull()
      .references(() => account.id),
    publishedByTokenId: uuid('published_by_token_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    message: text('message'),
  },
  (t) => ({
    seqUq: unique('artifact_version_service_seq_uq').on(t.serviceId, t.seq),
    digestUq: unique('artifact_version_service_digest_uq').on(t.serviceId, t.bundleDigest),
    latestIdx: index('artifact_version_latest_idx').on(t.serviceId, t.seq),
  }),
);

export const artifactTag = pgTable(
  'artifact_tag',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => service.id),
    name: text('name').notNull(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => artifactVersion.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedByAccountId: uuid('updated_by_account_id')
      .notNull()
      .references(() => account.id),
  },
  (t) => ({ pk: unique('artifact_tag_pk').on(t.serviceId, t.name) }),
);
