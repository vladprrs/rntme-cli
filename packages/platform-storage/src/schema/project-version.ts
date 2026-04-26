import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  unique,
  index,
  bigint,
} from 'drizzle-orm/pg-core';
import { account, organization } from './identity.js';
import { project } from './projects.js';

export const projectVersion = pgTable(
  'project_version',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    bundleDigest: text('bundle_digest').notNull(),
    bundleBlobKey: text('bundle_blob_key').notNull(),
    bundleSizeBytes: bigint('bundle_size_bytes', { mode: 'number' }).notNull(),
    summary: jsonb('summary').notNull(),
    uploadedByAccountId: uuid('uploaded_by_account_id')
      .notNull()
      .references(() => account.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seqUq: unique('project_version_project_seq_uq').on(t.projectId, t.seq),
    digestUq: unique('project_version_project_digest_uq').on(t.projectId, t.bundleDigest),
    latestIdx: index('project_version_latest_idx').on(t.projectId, t.seq),
  }),
);
