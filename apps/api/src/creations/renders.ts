import { renders, type Database } from "@studio/db";
import type { Storage } from "@studio/storage";
import { desc, type SQL } from "drizzle-orm";

/** Renders matching `where`, newest first, each file with a short-lived download URL. */
export async function listRenders(db: Database, storage: Storage, where: SQL) {
  const rows = await db.select().from(renders).where(where).orderBy(desc(renders.createdAt));
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      urls: await Promise.all(row.storageKeys.map((key) => storage.presignDownload(key))),
    })),
  );
}
