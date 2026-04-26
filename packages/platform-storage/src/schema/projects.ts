import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { organization } from './identity.js';

export const project = pgTable(
  'project',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique('project_org_slug_uq').on(t.orgId, t.slug) }),
);
