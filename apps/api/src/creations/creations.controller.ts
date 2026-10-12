import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import { renders, type Database } from "@studio/db";
import { resolveWorkspaceDir } from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, eq, isNull } from "drizzle-orm";
import type { Request, Response } from "express";
import { DATABASE } from "../database/database.module";
import { ZodPipe } from "../shared/zod.pipe";
import { STORAGE } from "../storage/storage.module";
import {
  approveSchema,
  feedbackSchema,
  shotsRequestSchema,
  type ApproveBody,
  type ShotsRequest,
  listCreationsQuerySchema,
  renderRequestSchema,
  updateCreationSchema,
  variablesSchema,
  type ListCreationsQuery,
  type RenderRequestBody,
  type UpdateCreation,
  type VariablesBody,
} from "./creations.schemas";
import { CreationsService } from "./creations.service";
import { JobsService } from "./jobs.service";
import { listRenders } from "./renders";
import { resolveVideoFile } from "./workspace-files";

const PREVIEW_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

@Controller("creations")
export class CreationsController {
  constructor(
    @Inject(CreationsService) private readonly creations: CreationsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Créations of every project, e.g. all templates. */
  @Get()
  list(@Query(new ZodPipe(listCreationsQuerySchema)) query: ListCreationsQuery) {
    return this.creations.list(query);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.creations.get(id);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateCreationSchema)) body: UpdateCreation) {
    return this.creations.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.creations.remove(id);
  }

  /** A template's variables: the validated contract (VARIABLES.json) and what index.html declares. */
  @Get(":id/variables")
  variables(@Param("id", ParseUUIDPipe) id: string) {
    return this.creations.variables(id);
  }

  @Put(":id/variables")
  saveVariables(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(variablesSchema)) body: VariablesBody) {
    return this.creations.saveVariables(id, body.variables);
  }

  @Post(":id/variables/apply")
  applyVariables(@Param("id", ParseUUIDPipe) id: string) {
    return this.creations.applyVariables(id);
  }

  @Get(":id/jobs")
  async listJobs(@Param("id", ParseUUIDPipe) id: string) {
    await this.creations.get(id);
    return this.jobs.listForCreation(id);
  }

  @Post(":id/generate")
  generate(@Param("id", ParseUUIDPipe) id: string) {
    return this.creations.generate(id);
  }

  @Post(":id/approve")
  approve(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(approveSchema)) body: ApproveBody) {
    return this.creations.approve(id, body);
  }

  /** A realistic création's keyframes or shots, generated again from their review. */
  @Post(":id/shots")
  shots(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(shotsRequestSchema)) body: ShotsRequest) {
    return this.creations.regenerateShots(id, body);
  }

  @Post(":id/feedback")
  feedback(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(feedbackSchema)) body: { text: string }) {
    return this.creations.feedback(id, body.text);
  }

  /** The création's exports (iteration renders excluded: they live on their iteration), with download URLs. */
  @Get(":id/renders")
  async renders(@Param("id", ParseUUIDPipe) id: string) {
    await this.creations.get(id);
    return listRenders(this.db, this.storage, and(eq(renders.creationId, id), isNull(renders.iterationId))!);
  }

  @Post(":id/renders")
  render(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(renderRequestSchema)) body: RenderRequestBody) {
    return this.creations.render(id, body);
  }

  /** Read-only preview of the création's folder (storyboard.html, SCRIPT.md, snapshots…) for the review screens. */
  @Get(":id/files/*path")
  async file(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const creation = await this.creations.get(id);
    const raw = (req.params as Record<string, string | string[]>).path;
    const relative = Array.isArray(raw) ? raw.join("/") : raw;
    const path = resolveVideoFile(resolveWorkspaceDir(), creation.slug, relative);
    if (!path) throw new NotFoundException();
    try {
      const content = await readFile(path);
      res.type(PREVIEW_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream").send(content);
    } catch {
      throw new NotFoundException();
    }
  }
}
