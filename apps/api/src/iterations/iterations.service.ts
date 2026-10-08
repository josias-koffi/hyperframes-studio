import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { creations, iterations, jobs, projects, renders, type Database } from "@studio/db";
import { allowedFormats, defaultVariableValues, deliverableFor, resolveWorkspaceDir, validateVariableValues, type RenderFormat } from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, desc, eq } from "drizzle-orm";
import { currentUserId } from "../auth/request-context";
import { DATABASE } from "../database/database.module";
import { readCreationVariables } from "../creations/creation-variables";
import { CreationsService, type Creation } from "../creations/creations.service";
import { JobsService } from "../creations/jobs.service";
import { listRenders } from "../creations/renders";
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
    @Inject(CreationsService) private readonly creations: CreationsService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** A template is usable once its build has been approved at least once. */
  private async builtTemplate(creationId: string) {
    const creation = await this.creations.template(creationId);
    const [built] = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.creationId, creationId), eq(jobs.step, "build"), eq(jobs.status, "succeeded")))
      .limit(1);
    if (creation.currentStep !== "build" || !built) throw new ConflictException("Le template n'est pas encore construit.");
    return creation;
  }

  private checkFormat(creation: Creation, format: RenderFormat | undefined) {
    if (format && !allowedFormats(creation.type).includes(format))
      throw new BadRequestException(`Format ${format} indisponible pour ce type de création.`);
  }

  /** Each iteration with its newest render job and render, for the iterations table. */
  async list(creationId: string) {
    await this.creations.get(creationId);
    const rows = await this.db.select().from(iterations).where(eq(iterations.creationId, creationId)).orderBy(desc(iterations.updatedAt));
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

  /** The signed-in person's iteration (through its template's project). */
  async get(id: string) {
    const [row] = await this.db
      .select({ iteration: iterations })
      .from(iterations)
      .innerJoin(creations, eq(creations.id, iterations.creationId))
      .innerJoin(projects, eq(projects.id, creations.projectId))
      .where(and(eq(iterations.id, id), eq(projects.ownerId, currentUserId())));
    if (!row) throw new NotFoundException("iteration not found");
    return row.iteration;
  }

  private async check(slug: string, values: Record<string, unknown>) {
    const { declared } = await readCreationVariables(resolveWorkspaceDir(), slug);
    const errors = validateVariableValues(declared, values);
    if (errors.length > 0) throw new BadRequestException({ message: `Variables invalides : ${errors.join(" ; ")}`, errors });
    return declared;
  }

  async create(creationId: string, input: CreateIteration) {
    const creation = await this.builtTemplate(creationId);
    this.checkFormat(creation, input.format);
    const { declared } = await readCreationVariables(resolveWorkspaceDir(), creation.slug);
    const values = input.values ?? defaultVariableValues(declared);
    await this.check(creation.slug, values);
    const [row] = await this.db
      .insert(iterations)
      .values({ creationId, name: input.name, values, format: input.format ?? deliverableFor(creation).format })
      .returning();
    return row;
  }

  /** Saving keeps values of variables the template no longer declares: they are dropped only when rendering. */
  async update(id: string, input: UpdateIteration) {
    const iteration = await this.get(id);
    const creation = await this.creations.get(iteration.creationId);
    this.checkFormat(creation, input.format);
    if (input.values) {
      const { declared } = await readCreationVariables(resolveWorkspaceDir(), creation.slug);
      const ids = new Set(declared.map((variable) => variable.id));
      await this.check(creation.slug, Object.fromEntries(Object.entries(input.values).filter(([key]) => ids.has(key))));
    }
    const [row] = await this.db.update(iterations).set({ ...input, updatedAt: new Date() }).where(eq(iterations.id, id)).returning();
    return row;
  }

  /** Deletes the iteration with its renders: they would otherwise fall back into the création's exports. */
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
    const creation = await this.builtTemplate(iteration.creationId);
    const last = await this.creations.lastClaudeJob(creation.id);
    if (last && ["queued", "running"].includes(last.status)) {
      throw new ConflictException("Claude met à jour la composition : attends la fin de l'étape pour générer.");
    }
    const { declared } = await readCreationVariables(resolveWorkspaceDir(), creation.slug);
    const ids = new Set(declared.map((variable) => variable.id));
    const variables = Object.fromEntries(Object.entries(iteration.values).filter(([key]) => ids.has(key)));
    await this.check(creation.slug, variables);
    const format = request.format ?? iteration.format;
    // A video's post image is one frame; an image or a carousel is captured at its own times.
    return this.creations.render(creation.id, { format, variables, frames: format === "png" ? (request.frames ?? 1) : undefined }, id);
  }

  async renders(id: string) {
    await this.get(id);
    return listRenders(this.db, this.storage, eq(renders.iterationId, id));
  }

  async jobsOf(id: string) {
    await this.get(id);
    return this.jobs.listForIteration(id);
  }
}
