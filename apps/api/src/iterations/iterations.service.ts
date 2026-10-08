import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { iterations, jobs, renders, type Database } from "@studio/db";
import { defaultVariableValues, resolveWorkspaceDir, validateVariableValues } from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE } from "../database/database.module";
import { JobsService } from "../jobs/jobs.service";
import { readProjectVariables } from "../projects/project-variables";
import { ProjectsService } from "../projects/projects.service";
import { listRenders } from "../renders/renders.controller";
import { STORAGE } from "../storage/storage.module";
import type { CreateIteration, RenderIteration, UpdateIteration } from "./iterations.schemas";

/**
 * The uses of a template. Values are checked against what `index.html` declares now, not against a snapshot:
 * a template whose variables changed keeps its iterations, and a removed variable is reported, never sent.
 */
@Injectable()
export class IterationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  private async lastClaudeJob(projectId: string) {
    const [row] = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.projectId, projectId), eq(jobs.kind, "claude")))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** A template is usable once its build has been approved at least once. */
  private async builtTemplate(projectId: string) {
    const project = await this.projects.get(projectId);
    if (project.kind !== "template") throw new BadRequestException("Ce projet n'est pas un template.");
    const [built] = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.projectId, projectId), eq(jobs.step, "build"), eq(jobs.status, "succeeded")))
      .limit(1);
    if (project.currentStep !== "build" || !built) throw new ConflictException("Le template n'est pas encore construit.");
    return project;
  }

  /** Each iteration with its newest render job and render, for the iterations table. */
  async list(projectId: string) {
    await this.projects.get(projectId);
    const rows = await this.db.select().from(iterations).where(eq(iterations.projectId, projectId)).orderBy(desc(iterations.updatedAt));
    return Promise.all(
      rows.map(async (row) => {
        const [[lastJob], [lastRender]] = await Promise.all([
          this.db.select().from(jobs).where(eq(jobs.iterationId, row.id)).orderBy(desc(jobs.createdAt)).limit(1),
          listRenders(this.db, this.storage, eq(renders.iterationId, row.id)).then((list) => list.slice(0, 1)),
        ]);
        return { ...row, lastJob: lastJob ?? null, lastRender: lastRender ?? null };
      }),
    );
  }

  async get(id: string) {
    const [row] = await this.db.select().from(iterations).where(eq(iterations.id, id));
    if (!row) throw new NotFoundException("iteration not found");
    return row;
  }

  private async check(slug: string, values: Record<string, unknown>) {
    const { declared } = await readProjectVariables(resolveWorkspaceDir(), slug);
    const errors = validateVariableValues(declared, values);
    if (errors.length > 0) throw new BadRequestException({ message: `Variables invalides : ${errors.join(" ; ")}`, errors });
    return declared;
  }

  async create(projectId: string, input: CreateIteration) {
    const project = await this.builtTemplate(projectId);
    const { declared } = await readProjectVariables(resolveWorkspaceDir(), project.slug);
    const values = input.values ?? defaultVariableValues(declared);
    await this.check(project.slug, values);
    const [row] = await this.db.insert(iterations).values({ projectId, name: input.name, values, format: input.format }).returning();
    return row;
  }

  /** Saving keeps values of variables the template no longer declares: they are dropped only when rendering. */
  async update(id: string, input: UpdateIteration) {
    const iteration = await this.get(id);
    if (input.values) {
      const project = await this.projects.get(iteration.projectId);
      const { declared } = await readProjectVariables(resolveWorkspaceDir(), project.slug);
      const ids = new Set(declared.map((variable) => variable.id));
      await this.check(project.slug, Object.fromEntries(Object.entries(input.values).filter(([key]) => ids.has(key))));
    }
    const [row] = await this.db.update(iterations).set({ ...input, updatedAt: new Date() }).where(eq(iterations.id, id)).returning();
    return row;
  }

  /** Deletes the iteration with its renders: they would otherwise fall back into the project's exports. */
  async remove(id: string) {
    await this.get(id);
    const rows = await this.db.select({ keys: renders.storageKeys }).from(renders).where(eq(renders.iterationId, id));
    await this.db.delete(renders).where(eq(renders.iterationId, id));
    await this.db.delete(jobs).where(eq(jobs.iterationId, id));
    await this.db.delete(iterations).where(eq(iterations.id, id));
    await Promise.allSettled(rows.flatMap((row) => row.keys).map((key) => this.storage.delete(key)));
    return { id };
  }

  /** Renders the saved values, without Claude. */
  async render(id: string, request: RenderIteration) {
    const iteration = await this.get(id);
    const project = await this.builtTemplate(iteration.projectId);
    const last = await this.lastClaudeJob(project.id);
    if (last && ["queued", "running"].includes(last.status)) {
      throw new ConflictException("Claude met à jour la composition : attends la fin de l'étape pour générer.");
    }
    const { declared } = await readProjectVariables(resolveWorkspaceDir(), project.slug);
    const ids = new Set(declared.map((variable) => variable.id));
    const variables = Object.fromEntries(Object.entries(iteration.values).filter(([key]) => ids.has(key)));
    await this.check(project.slug, variables);
    const format = request.format ?? iteration.format;
    return this.jobs.enqueueRender({
      projectId: project.id,
      slug: project.slug,
      iterationId: id,
      format,
      variables,
      frames: format === "png" ? (request.frames ?? 1) : undefined,
    });
  }

  renders(id: string) {
    return listRenders(this.db, this.storage, eq(renders.iterationId, id));
  }

  jobsOf(id: string) {
    return this.jobs.listForIteration(id);
  }
}
