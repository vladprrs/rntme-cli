import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { organization } from './identity';

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

export const service = pgTable(
  'service',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique('service_project_slug_uq').on(t.projectId, t.slug) }),
);
