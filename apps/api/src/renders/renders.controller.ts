import { Controller, Get, Inject, Param, ParseUUIDPipe } from "@nestjs/common";
import { renders, type Database } from "@studio/db";
import type { Storage } from "@studio/storage";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { DATABASE } from "../database/database.module";
import { STORAGE } from "../storage/storage.module";

@Controller("projects/:projectId/renders")
export class RendersController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Renders of a project (iteration renders excluded: they live on their iteration), each file with a short-lived download URL. */
  @Get()
  list(@Param("projectId", ParseUUIDPipe) projectId: string) {
    return listRenders(this.db, this.storage, and(eq(renders.projectId, projectId), isNull(renders.iterationId))!);
  }
}

export async function listRenders(db: Database, storage: Storage, where: SQL) {
  const rows = await db.select().from(renders).where(where).orderBy(desc(renders.createdAt));
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      urls: await Promise.all(row.storageKeys.map((key) => storage.presignDownload(key))),
    })),
  );
}
