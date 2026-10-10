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
import { assets, creations, projects, type Database } from "@studio/db";
import { sanitizeFilename, storageKeys, type Storage } from "@studio/storage";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { currentUserId } from "../auth/request-context";
import { DATABASE } from "../database/database.module";
import { ZodPipe } from "../shared/zod.pipe";
import { STORAGE } from "../storage/storage.module";

const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;

const uploadSchema = z.object({
  projectId: z.string().uuid().optional(),
  /** Footage or music of one création: synced to that création only. */
  creationId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(MAX_UPLOAD),
  kind: z.enum(["image", "video", "audio", "font", "logo", "document", "other"]),
  tags: z.array(z.string().max(40)).max(20).default([]),
});
type UploadRequest = z.infer<typeof uploadSchema>;

const attachSchema = z.object({ projectId: z.string().uuid() });
const listSchema = z.object({ projectId: z.string().uuid().optional(), creationId: z.string().uuid().optional() });

@Controller("assets")
export class AssetsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** The signed-in person's asset: someone else's is as unknown as a missing one. */
  private async find(id: string) {
    const [row] = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.ownerId, currentUserId())));
    if (!row) throw new NotFoundException();
    return row;
  }

  private async ownedProject(projectId: string) {
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, currentUserId())));
    if (!project) throw new NotFoundException("project not found");
    return project;
  }

  private async ownedCreation(creationId: string) {
    const [creation] = await this.db
      .select({ projectId: creations.projectId })
      .from(creations)
      .innerJoin(projects, eq(projects.id, creations.projectId))
      .where(and(eq(creations.id, creationId), eq(projects.ownerId, currentUserId())));
    if (!creation) throw new NotFoundException("creation not found");
    return creation;
  }

  /**
   * Lists what a création sees (the campaign's assets and its own), a project's assets, or the signed-in person's
   * library without either, each with a preview URL.
   */
  @Get()
  async list(@Query(new ZodPipe(listSchema)) query: z.infer<typeof listSchema>) {
    let where = query.projectId ? eq(assets.projectId, query.projectId) : isNull(assets.projectId);
    if (query.creationId) {
      const creation = await this.ownedCreation(query.creationId);
      where = and(eq(assets.projectId, creation.projectId), or(isNull(assets.creationId), eq(assets.creationId, query.creationId)))!;
    }
    const rows = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.ownerId, currentUserId()), where))
      .orderBy(desc(assets.createdAt));
    return Promise.all(rows.map(async (row) => ({ ...row, url: await this.storage.presignDownload(row.storageKey) })));
  }

  /** Registers the asset and returns a presigned PUT: the browser uploads the file to the API's `/files`. */
  @Post("uploads")
  async upload(@Body(new ZodPipe(uploadSchema)) body: UploadRequest) {
    if (body.creationId) body.projectId = (await this.ownedCreation(body.creationId)).projectId;
    else if (body.projectId) await this.ownedProject(body.projectId);
    const id = randomUUID();
    const filename = sanitizeFilename(body.filename);
    const storageKey = storageKeys.asset(id, filename);
    const [row] = await this.db
      .insert(assets)
      .values({ id, ...body, ownerId: currentUserId(), filename, storageKey })
      .returning();
    const uploadUrl = await this.storage.presignUpload(storageKey, body.contentType);
    return { asset: row, uploadUrl };
  }

  /** Copies a library asset into a project: the runner syncs it into every création's `assets/uploads/`. */
  @Post(":id/attach")
  async attach(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(attachSchema)) body: z.infer<typeof attachSchema>) {
    const source = await this.find(id);
    await this.ownedProject(body.projectId);
    const copyId = randomUUID();
    const storageKey = storageKeys.asset(copyId, source.filename);
    await this.storage.copy(source.storageKey, storageKey);
    const [row] = await this.db
      .insert(assets)
      .values({
        id: copyId,
        ownerId: source.ownerId,
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

  /** Removes the object and its row. A copy already synced into a création's folder stays there. */
  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.find(id);
    await this.storage.delete(row.storageKey);
    await this.db.delete(assets).where(eq(assets.id, id));
  }
}
