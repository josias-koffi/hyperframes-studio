import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, Res } from "@nestjs/common";
import { resolveWorkspaceDir } from "@studio/shared";
import type { Request, Response } from "express";
import { JobsService } from "../jobs/jobs.service";
import { ZodPipe } from "../shared/zod.pipe";
import {
  createProjectSchema,
  feedbackSchema,
  renderRequestSchema,
  updateProjectSchema,
  type CreateProject,
  type RenderRequest,
  type UpdateProject,
} from "./projects.schemas";
import { ProjectsService } from "./projects.service";
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
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

@Controller("projects")
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Post()
  create(@Body(new ZodPipe(createProjectSchema)) body: CreateProject) {
    return this.projects.create(body);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.projects.get(id);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(updateProjectSchema)) body: UpdateProject) {
    return this.projects.update(id, body);
  }

  @Get(":id/jobs")
  listJobs(@Param("id", ParseUUIDPipe) id: string) {
    return this.jobs.listForProject(id);
  }

  @Post(":id/generate")
  generate(@Param("id", ParseUUIDPipe) id: string) {
    return this.projects.generate(id);
  }

  @Post(":id/approve")
  approve(@Param("id", ParseUUIDPipe) id: string) {
    return this.projects.approve(id);
  }

  @Post(":id/feedback")
  feedback(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(feedbackSchema)) body: { text: string }) {
    return this.projects.feedback(id, body.text);
  }

  /** Opens the project in the HyperFrames Studio editor and returns where to find it. */
  @Post(":id/studio")
  studio(@Param("id", ParseUUIDPipe) id: string) {
    return this.projects.openStudio(id);
  }

  @Post(":id/renders")
  render(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(renderRequestSchema)) body: RenderRequest) {
    return this.projects.render(id, body);
  }

  /** Read-only preview of the video folder (storyboard.html, SCRIPT.md, snapshots…) for the review screens. */
  @Get(":id/files/*path")
  async file(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const project = await this.projects.get(id);
    const raw = (req.params as Record<string, string | string[]>).path;
    const relative = Array.isArray(raw) ? raw.join("/") : raw;
    const workspace = resolveWorkspaceDir();
    const path = resolveVideoFile(workspace, project.slug, relative);
    if (!path) throw new NotFoundException();
    try {
      const content = await readFile(path);
      res.type(PREVIEW_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream").send(content);
    } catch {
      throw new NotFoundException();
    }
  }
}
