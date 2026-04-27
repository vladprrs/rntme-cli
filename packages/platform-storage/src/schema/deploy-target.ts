import type { Buffer } from 'node:buffer';
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organization } from './identity.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const deployTarget = pgTable(
  'deploy_target',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    kind: text('kind').notNull(),
    dokployUrl: text('dokploy_url').notNull(),
    publicBaseUrl: text('public_base_url').notNull(),
    dokployProjectId: text('dokploy_project_id'),
    dokployProjectName: text('dokploy_project_name'),
    allowCreateProject: boolean('allow_create_project').notNull().default(false),
    apiTokenCiphertext: bytea('api_token_ciphertext').notNull(),
    apiTokenNonce: bytea('api_token_nonce').notNull(),
    apiTokenKeyVersion: smallint('api_token_key_version').notNull(),
    eventBusConfig: jsonb('event_bus_config').$type<Record<string, unknown>>().notNull(),
    policyValues: jsonb('policy_values').$type<Record<string, unknown>>().notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUq: unique('deploy_target_org_slug_uq').on(t.orgId, t.slug),
    oneDefaultPerOrg: uniqueIndex('one_default_per_org').on(t.orgId).where(sql`${t.isDefault}`),
  }),
);
