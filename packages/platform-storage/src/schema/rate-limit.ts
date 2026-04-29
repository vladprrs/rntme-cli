import type { Buffer } from 'node:buffer';
import { customType, index, integer, pgTable, primaryKey, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const platformRateLimit = pgTable(
  'platform_rate_limit',
  {
    bucketKeyHash: bytea('bucket_key_hash').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ name: 'platform_rate_limit_pk', columns: [t.bucketKeyHash, t.windowStart] }),
    expiresAtIdx: index('platform_rate_limit_expires_at_idx').on(t.expiresAt),
    countPositive: check('platform_rate_limit_count_positive', sql`${t.count} > 0`),
  }),
);
