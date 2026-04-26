import { bigserial, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { deployment } from './deployment.js';
import { organization } from './identity.js';

export const deploymentLogLine = pgTable(
  'deployment_log_line',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    deploymentId: uuid('deployment_id')
      .notNull()
      .references(() => deployment.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
    level: text('level').notNull(),
    step: text('step').notNull(),
    message: text('message').notNull(),
  },
  (t) => ({
    logIdx: index('deployment_log_line_idx').on(t.deploymentId, t.id),
  }),
);
