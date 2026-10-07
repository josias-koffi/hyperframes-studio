import { randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { assets, projects, type Database } from "@studio/db";
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

const attachSchema = z.object({ projectId: z.string().uuid() });

@Controller("assets")
export class AssetsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  private async find(id: string) {
    const [row] = await this.db.select().from(assets).where(eq(assets.id, id));
    if (!row) throw new NotFoundException();
    return row;
  }

  /** Lists a project's assets, or the shared library without `projectId`, each with a preview URL. */
  @Get()
  async list(@Query("projectId") projectId?: string) {
    const where = projectId ? eq(assets.projectId, projectId) : isNull(assets.projectId);
    const rows = await this.db.select().from(assets).where(where).orderBy(desc(assets.createdAt));
    return Promise.all(rows.map(async (row) => ({ ...row, url: await this.storage.presignDownload(row.storageKey) })));
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

  /** Copies a library asset into a project: the runner syncs project assets to `assets/uploads/`. */
  @Post(":id/attach")
  async attach(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(attachSchema)) body: z.infer<typeof attachSchema>) {
    const source = await this.find(id);
    const [project] = await this.db.select({ id: projects.id }).from(projects).where(eq(projects.id, body.projectId));
    if (!project) throw new NotFoundException("project not found");
    const copyId = randomUUID();
    const storageKey = storageKeys.asset(copyId, source.filename);
    await this.storage.copy(source.storageKey, storageKey);
    const [row] = await this.db
      .insert(assets)
      .values({
        id: copyId,
        projectId: body.projectId,
        kind: source.kind,
        filename: source.filename,
        storageKey,
        contentType: source.contentType,
        size: source.size,
        tags: source.tags,
      })
      .returning();
    return row;
  }

  @Get(":id/url")
  async url(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.find(id);
    return { url: await this.storage.presignDownload(row.storageKey) };
  }

  /** Removes the object and its row. A copy already synced into a video folder stays there. */
  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.find(id);
    await this.storage.delete(row.storageKey);
    await this.db.delete(assets).where(eq(assets.id, id));
  }
}
