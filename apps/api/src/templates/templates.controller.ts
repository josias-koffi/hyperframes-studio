import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { renders, templates, type Database } from "@studio/db";
import type { Storage } from "@studio/storage";
import {
  parseCompositionVariables,
  RENDER_FORMATS,
  resolveWorkspaceDir,
  validateVariableValues,
  type CompositionVariable,
} from "@studio/shared";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../database/database.module";
import { JobsService } from "../jobs/jobs.service";
import { ProjectsService } from "../projects/projects.service";
import { listRenders } from "../renders/renders.controller";
import { STORAGE } from "../storage/storage.module";
import { ZodPipe } from "../shared/zod.pipe";

const createSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});
const instantiateSchema = z.object({
  format: z.enum(RENDER_FORMATS).default("mp4"),
  variables: z.record(z.string(), z.unknown()).default({}),
  at: z.array(z.number().nonnegative()).max(20).optional(),
  frames: z.number().int().min(1).max(10).optional(),
});

@Controller("templates")
export class TemplatesController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Get()
  list() {
    return this.db.select().from(templates).orderBy(desc(templates.updatedAt));
  }

  @Get(":id")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const [template] = await this.db.select().from(templates).where(eq(templates.id, id));
    if (!template) throw new NotFoundException();
    return template;
  }

  /** What this template produced: kept apart from the source project's exports. */
  @Get(":id/renders")
  renders(@Param("id", ParseUUIDPipe) id: string) {
    return listRenders(this.db, this.storage, eq(renders.templateId, id));
  }

  @Get(":id/jobs")
  jobsList(@Param("id", ParseUUIDPipe) id: string) {
    return this.jobs.listForTemplate(id);
  }

  /** Saves a project as a template: its form is the composition's `data-composition-variables`. */
  @Post()
  async create(@Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>) {
    const project = await this.projects.get(body.projectId);
    const workspace = resolveWorkspaceDir();
    let variables: CompositionVariable[];
    try {
      variables = parseCompositionVariables(await readFile(join(workspace, "videos", project.slug, "index.html"), "utf8"));
    } catch (error) {
      throw new BadRequestException(`Impossible de lire les variables de la composition : ${(error as Error).message}`);
    }
    if (!variables.length) {
      throw new BadRequestException("La composition ne déclare aucune variable (data-composition-variables) : il n'y a rien à remplir. Demande à Claude d'en ajouter pendant le build.");
    }
    const [row] = await this.db.insert(templates).values({ ...body, variables }).returning();
    return row;
  }

  /** Fills the template and renders it: no Claude involved. */
  @Post(":id/render")
  async render(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(instantiateSchema)) body: z.infer<typeof instantiateSchema>,
  ) {
    const [template] = await this.db.select().from(templates).where(eq(templates.id, id));
    if (!template) throw new NotFoundException();
    const errors = validateVariableValues(template.variables as CompositionVariable[], body.variables);
    if (errors.length) throw new BadRequestException({ message: "Variables invalides", errors });
    const project = await this.projects.get(template.projectId);
    return this.jobs.enqueueRender({ projectId: project.id, slug: project.slug, templateId: template.id, ...body });
  }
}
