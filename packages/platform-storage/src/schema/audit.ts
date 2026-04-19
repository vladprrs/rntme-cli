import { pgTable, uuid, text, timestamp, bigserial, jsonb, index } from 'drizzle-orm/pg-core';
import { organization, account } from './identity';

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    actorAccountId: uuid('actor_account_id')
      .notNull()
      .references(() => account.id),
    actorTokenId: uuid('actor_token_id'),
    action: text('action').notNull(),
    resourceKind: text('resource_kind').notNull(),
    resourceId: text('resource_id').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgTimeIdx: index('audit_log_org_time_idx').on(t.orgId, t.createdAt) }),
);

export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (t) => ({ undeliveredIdx: index('event_outbox_undelivered_idx').on(t.deliveredAt, t.id) }),
);
