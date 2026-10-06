import { Controller, Get, Inject, Param, ParseUUIDPipe } from "@nestjs/common";
import { renders, type Database } from "@studio/db";
import type { Storage } from "@studio/storage";
import { desc, eq } from "drizzle-orm";
import { DATABASE } from "../database/database.module";
import { STORAGE } from "../storage/storage.module";

@Controller("projects/:projectId/renders")
export class RendersController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Renders of a project, each file with a short-lived download URL. */
  @Get()
  async list(@Param("projectId", ParseUUIDPipe) projectId: string) {
    const rows = await this.db.select().from(renders).where(eq(renders.projectId, projectId)).orderBy(desc(renders.createdAt));
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        urls: await Promise.all(row.storageKeys.map((key) => this.storage.presignDownload(key))),
      })),
    );
  }
}
