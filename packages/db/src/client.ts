import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseClient = { db: Database; close: () => Promise<void> };

const DEFAULT_DEV_URL = "postgresql://studio:studio@localhost:5447/studio";

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_URL?.trim() || DEFAULT_DEV_URL;
}

export function createDatabaseClient(url: string = resolveDatabaseUrl(), poolMax = 10): DatabaseClient {
  const pool = new Pool({ connectionString: url, max: poolMax });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

/**
 * The SQL migrations live in `packages/db/drizzle`, next to this package's
 * `dist/` and `src/`, whatever the working directory of the process.
 */
export function resolveMigrationsDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.DATABASE_MIGRATIONS_DIR?.trim();
  if (explicit) return resolve(explicit);
  const candidates = [resolve(__dirname, "../drizzle"), resolve(process.cwd(), "packages/db/drizzle")];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export async function runMigrations(url: string = resolveDatabaseUrl()): Promise<string> {
  const pool = new Pool({ connectionString: url, max: 1 });
  const folder = resolveMigrationsDir();
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
  return folder;
}
