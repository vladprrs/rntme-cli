import { pgTable, uuid, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const account = pgTable('account', {
  id: uuid('id').primaryKey(),
  workosUserId: text('workos_user_id').notNull().unique(),
  email: text('email'),
  displayName: text('display_name').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey(),
  workosOrganizationId: text('workos_organization_id').notNull().unique(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const membershipMirror = pgTable(
  'membership_mirror',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    role: text('role').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.accountId] }) }),
);

export const workosEventLog = pgTable('workos_event_log', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});
