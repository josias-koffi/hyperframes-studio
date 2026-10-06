import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { assets, type Database } from "@studio/db";
import { sanitizeFilename, storageKeys, type Storage } from "@studio/storage";
import { desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../database/database.module";
import { ZodPipe } from "../shared/zod.pipe";
import { STORAGE } from "../storage/storage.module";

const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;

const uploadSchema = z.object({
  projectId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(MAX_UPLOAD),
  kind: z.enum(["image", "video", "audio", "font", "logo", "document", "other"]),
  tags: z.array(z.string().max(40)).max(20).default([]),
});
type UploadRequest = z.infer<typeof uploadSchema>;

@Controller("assets")
export class AssetsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Lists a project's assets, or the shared library without `projectId`. */
  @Get()
  list(@Query("projectId") projectId?: string) {
    const where = projectId ? eq(assets.projectId, projectId) : isNull(assets.projectId);
    return this.db.select().from(assets).where(where).orderBy(desc(assets.createdAt));
  }

  /** Registers the asset and returns a presigned PUT: the browser uploads straight to MinIO. */
  @Post("uploads")
  async upload(@Body(new ZodPipe(uploadSchema)) body: UploadRequest) {
    const id = randomUUID();
    const filename = sanitizeFilename(body.filename);
    const storageKey = storageKeys.asset(id, filename);
    const [row] = await this.db
      .insert(assets)
      .values({ id, ...body, filename, storageKey })
      .returning();
    const uploadUrl = await this.storage.presignUpload(storageKey, body.contentType);
    return { asset: row, uploadUrl };
  }

  @Get(":id/url")
  async url(@Param("id", ParseUUIDPipe) id: string) {
    const [row] = await this.db.select().from(assets).where(eq(assets.id, id));
    if (!row) throw new NotFoundException();
    return { url: await this.storage.presignDownload(row.storageKey) };
  }
}
