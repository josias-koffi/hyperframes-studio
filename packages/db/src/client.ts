import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { resolveFromRoot } from "@studio/shared";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type Database = PgliteDatabase<typeof schema>;
export type DatabaseClient = { db: Database; close: () => Promise<void> };

/** Postgres embedded in the process (PGlite), its data in `DATABASE_DIR`. */
export function resolveDatabaseDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveFromRoot(env.DATABASE_DIR?.trim() || ".data/database", env);
}

type Shared = { pg: PGlite; db: Database; users: number };
const opened = new Map<string, Shared>();

/**
 * One PGlite per folder and process, shared by the API and the workers that run alongside it: it holds its folder
 * alone. Closed when its last user closes it.
 */
export function createDatabaseClient(dir: string = resolveDatabaseDir()): DatabaseClient {
  let shared = opened.get(dir);
  if (!shared) {
    // PGlite creates its own folder, not the ones above it.
    mkdirSync(dirname(dir), { recursive: true });
    const pg = new PGlite(dir);
    shared = { pg, db: drizzle({ client: pg, schema }), users: 0 };
    opened.set(dir, shared);
  }
  const mine = shared;
  mine.users += 1;
  let closed = false;
  return {
    db: mine.db,
    async close() {
      if (closed) return;
      closed = true;
      mine.users -= 1;
      if (mine.users > 0) return;
      opened.delete(dir);
      await mine.pg.close();
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

export async function runMigrations(dir: string = resolveDatabaseDir()): Promise<string> {
  const folder = resolveMigrationsDir();
  const client = createDatabaseClient(dir);
  try {
    await migrate(client.db, { migrationsFolder: folder });
  } finally {
    await client.close();
  }
  return folder;
}
