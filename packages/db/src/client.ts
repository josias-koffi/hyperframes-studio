import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseClient = { db: Database; close: () => Promise<void> };

const DEFAULT_DEV_URL = "postgresql://studio:studio@localhost:5447/studio";

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_URL?.trim() || DEFAULT_DEV_URL;
}

/** `pglite:<folder>`: Postgres embedded in the process (the desktop app), its data in that folder. */
const PGLITE = "pglite:";

export function createDatabaseClient(url: string = resolveDatabaseUrl(), poolMax = 10): DatabaseClient {
  if (url.startsWith(PGLITE)) return openPglite(url.slice(PGLITE.length));
  const pool = new Pool({ connectionString: url, max: poolMax });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

type SharedPglite = { pg: PGlite; db: Database; users: number };
const pglites = new Map<string, SharedPglite>();

/**
 * One PGlite per folder and process, shared by the API and the workers that run alongside it: it holds its folder
 * alone. Closed when its last user closes it.
 */
function openPglite(folder: string): DatabaseClient {
  let shared = pglites.get(folder);
  if (!shared) {
    const pg = new PGlite(folder);
    // Same SQL, same schema: only the driver's types differ from node-postgres.
    shared = { pg, db: drizzlePglite({ client: pg, schema }) as unknown as Database, users: 0 };
    pglites.set(folder, shared);
  }
  const opened = shared;
  opened.users += 1;
  let closed = false;
  return {
    db: opened.db,
    async close() {
      if (closed) return;
      closed = true;
      opened.users -= 1;
      if (opened.users > 0) return;
      pglites.delete(folder);
      await opened.pg.close();
    },
  };
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
  const folder = resolveMigrationsDir();
  if (url.startsWith(PGLITE)) {
    const client = openPglite(url.slice(PGLITE.length));
    try {
      await migratePglite(client.db as never, { migrationsFolder: folder });
    } finally {
      await client.close();
    }
    return folder;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
  return folder;
}
