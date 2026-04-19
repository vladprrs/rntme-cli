import { pgTable, text } from 'drizzle-orm/pg-core';

export const _schemaBootstrap = pgTable('_schema_bootstrap', {
  id: text('id').primaryKey(),
});
