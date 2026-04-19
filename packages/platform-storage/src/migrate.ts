import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import type { Db } from './pg/pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

export async function runMigrations(db: Db, pool: Pool): Promise<void> {
  const roles = await readFile(resolve(pkgRoot, 'src/sql/roles.sql'), 'utf8');
  await pool.query(roles);
  await migrate(db, { migrationsFolder: resolve(pkgRoot, 'drizzle') });
  const policies = await readFile(resolve(pkgRoot, 'src/sql/policies.sql'), 'utf8');
  await pool.query(policies);
}
