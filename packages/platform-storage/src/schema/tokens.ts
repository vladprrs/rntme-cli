import { Buffer } from 'node:buffer';
import { pgTable, uuid, text, timestamp, customType, index } from 'drizzle-orm/pg-core';
import { organization, account } from './identity.js';

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(v) {
    return Buffer.from(v);
  },
  fromDriver(v) {
    return new Uint8Array(v as Buffer);
  },
});

export const apiToken = pgTable(
  'api_token',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    name: text('name').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    prefix: text('prefix').notNull(),
    scopes: text('scopes').array().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ prefixIdx: index('api_token_prefix_idx').on(t.prefix) }),
);
