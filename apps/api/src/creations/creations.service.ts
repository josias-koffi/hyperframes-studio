import { rm } from "node:fs/promises";
import { join } from "node:path";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { assets, creations, iterations, jobs, projects, renders, type Database } from "@studio/db";
import {
  allowedFormats,
  defaultVariableValues,
  deliverableFor,
  nextStep,
  resolveWorkspaceDir,
  slugify,
  type CompositionVariable,
  type CreationKind,
  type CreationType,
  type RenderFormat,
} from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, count, desc, eq, inArray, isNull, like, type SQL } from "drizzle-orm";
import { currentUserId } from "../auth/request-context";
import { DATABASE } from "../database/database.module";
import { STORAGE } from "../storage/storage.module";
import { readCreationVariables, writeCreationVariables } from "./creation-variables";
import { creationValues, uniqueSlug, type ApproveBody, type CreateCreation, type RenderRequestBody, type ShotsRequest, type UpdateCreation } from "./creations.schemas";
import { JobsService } from "./jobs.service";

export type Creation = typeof creations.$inferSelect;

const ACTIVE = ["queued", "running"];
const STILLS: RenderFormat[] = ["png", "pdf"];
const CLIPS: RenderFormat[] = ["mp4", "webm", "mov"];

export type CreationFilter = { projectId?: string; type?: CreationType; kind?: CreationKind };

@Injectable()
export class CreationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /**
   * Créations with where they stand: newest Claude and render jobs, how many exports and iterations, a cover
   * (first still of the newest PNG or carousel render, else the newest video render, played muted by the card) and,
   * for a template, how many variables it has.
   */
  async list(filter: CreationFilter = {}) {
    const conditions = [
      eq(projects.ownerId, currentUserId()),
      filter.projectId ? eq(creations.projectId, filter.projectId) : undefined,
      filter.type ? eq(creations.type, filter.type) : undefined,
      filter.kind ? eq(creations.kind, filter.kind) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const rows = await this.db
      .select({ creation: creations, projectName: projects.name })
      .from(creations)
      .innerJoin(projects, eq(projects.id, creations.projectId))
      .where(and(...conditions))
      .orderBy(desc(creations.updatedAt));
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.creation.id);
    const latestJob = (kind: "claude" | "render") =>
      this.db
        .selectDistinctOn([jobs.creationId])
        .from(jobs)
        .where(and(inArray(jobs.creationId, ids), eq(jobs.kind, kind), isNull(jobs.iterationId)))
        .orderBy(jobs.creationId, desc(jobs.createdAt));
    const newestRender = (formats: RenderFormat[]) =>
      this.db
        .selectDistinctOn([renders.creationId], { creationId: renders.creationId, keys: renders.storageKeys })
        .from(renders)
        .where(and(inArray(renders.creationId, ids), inArray(renders.format, formats)))
        .orderBy(renders.creationId, desc(renders.createdAt));
    const [claudeJobs, renderJobs, renderCounts, iterationCounts, stills, clips] = await Promise.all([
      latestJob("claude"),
      latestJob("render"),
      this.db
        .select({ creationId: renders.creationId, total: count() })
        .from(renders)
        .where(and(inArray(renders.creationId, ids), isNull(renders.iterationId)))
        .groupBy(renders.creationId),
      this.db.select({ creationId: iterations.creationId, total: count() }).from(iterations).where(inArray(iterations.creationId, ids)).groupBy(iterations.creationId),
      newestRender(STILLS),
      newestRender(CLIPS),
    ]);
    const byCreation = <T extends { creationId: string }>(list: T[]) => new Map(list.map((item) => [item.creationId, item]));
    const claude = byCreation(claudeJobs);
    const render = byCreation(renderJobs);
    const renderCount = byCreation(renderCounts);
    const iterationCount = byCreation(iterationCounts);
    const still = byCreation(stills);
    const clip = byCreation(clips);
    const workspace = resolveWorkspaceDir();

    return Promise.all(
      rows.map(async ({ creation, projectName }) => {
        const stillKey = still.get(creation.id)?.keys.find((key) => key.endsWith(".png"));
        const clipKey = stillKey ? undefined : clip.get(creation.id)?.keys[0];
        let variableCount: number | null = null;
        if (creation.kind === "template") {
          const { proposed, declared } = await readCreationVariables(workspace, creation.slug);
          variableCount = (declared.length > 0 ? declared : (proposed ?? [])).length;
        }
        return {
          ...creation,
          projectName,
          lastClaudeJob: claude.get(creation.id) ?? null,
          lastRenderJob: render.get(creation.id) ?? null,
          renderCount: renderCount.get(creation.id)?.total ?? 0,
          iterationCount: iterationCount.get(creation.id)?.total ?? 0,
          variableCount,
          cover: stillKey
            ? { url: await this.storage.presignDownload(stillKey), kind: "image" as const }
            : clipKey
              ? { url: await this.storage.presignDownload(clipKey), kind: "video" as const }
              : null,
        };
      }),
    );
  }

  /** The signed-in person's création (through its project): someone else's is as unknown as a missing one. */
  async get(id: string) {
    const [row] = await this.db
      .select({ creation: creations, projectName: projects.name })
      .from(creations)
      .innerJoin(projects, eq(projects.id, creations.projectId))
      .where(and(eq(creations.id, id), eq(projects.ownerId, currentUserId())));
    if (!row) throw new NotFoundException("creation not found");
    return { ...row.creation, projectName: row.projectName };
  }

  async create(projectId: string, input: CreateCreation) {
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, currentUserId())));
    if (!project) throw new NotFoundException("project not found");
    const base = input.slug ?? slugify(input.name);
    const taken = await this.db.select({ slug: creations.slug }).from(creations).where(like(creations.slug, `${base}%`));
    const slug = uniqueSlug(base, new Set(taken.map((row) => row.slug)));
    const [row] = await this.db.insert(creations).values(creationValues(projectId, slug, input)).returning();
    await this.touchProject(projectId);
    return row;
  }

  async update(id: string, input: UpdateCreation) {
    await this.get(id);
    const [row] = await this.db.update(creations).set({ ...input, updatedAt: new Date() }).where(eq(creations.id, id)).returning();
    return row;
  }

  /**
   * Removes the création, its renders and own assets from the bucket and its folder. Refused while Claude
   * works on it: the runner would write into a folder that no longer exists.
   */
  async remove(id: string) {
    const creation = await this.get(id);
    await this.assertIdle([id], "Claude travaille sur cette création : attends la fin de l'étape.");
    const keys = await this.storedKeys([id]);
    await this.db.delete(creations).where(eq(creations.id, id));
    await this.discard(keys, [creation.slug]);
    return { id };
  }

  /** Refuses when Claude works on one of these créations. */
  async assertIdle(ids: string[], message: string) {
    if (ids.length === 0) return;
    const latest = await this.db
      .selectDistinctOn([jobs.creationId], { status: jobs.status })
      .from(jobs)
      .where(and(inArray(jobs.creationId, ids), eq(jobs.kind, "claude")))
      .orderBy(jobs.creationId, desc(jobs.createdAt));
    if (latest.some((job) => ACTIVE.includes(job.status))) throw new ConflictException(message);
  }

  /** Bucket objects of these créations: their renders and the files uploaded for them alone. */
  async storedKeys(ids: string[]) {
    if (ids.length === 0) return [];
    const [renderRows, assetRows] = await Promise.all([
      this.db.select({ keys: renders.storageKeys }).from(renders).where(inArray(renders.creationId, ids)),
      this.db.select({ key: assets.storageKey }).from(assets).where(inArray(assets.creationId, ids)),
    ]);
    return [...renderRows.flatMap((row) => row.keys), ...assetRows.map((row) => row.key)];
  }

  /** After the rows are gone: objects and folders. */
  async discard(keys: string[], slugs: string[]) {
    await Promise.allSettled(keys.map((key) => this.storage.delete(key)));
    const workspace = resolveWorkspaceDir();
    await Promise.all(slugs.map((slug) => rm(join(workspace, "videos", slug), { recursive: true, force: true })));
  }

  private touchProject(projectId: string) {
    return this.db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
  }

  private setCreation(id: string, values: Partial<typeof creations.$inferInsert>) {
    return this.db.update(creations).set({ ...values, updatedAt: new Date() }).where(eq(creations.id, id));
  }

  async lastClaudeJob(creationId: string) {
    const [row] = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.creationId, creationId), eq(jobs.kind, "claude")))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Starts (or restarts after a failure) the création's current step. */
  async generate(id: string) {
    const creation = await this.get(id);
    const last = await this.lastClaudeJob(id);
    if (last && ["queued", "running", "waiting_review"].includes(last.status)) {
      throw new ConflictException(last.status === "waiting_review" ? `L'étape « ${last.step} » attend ta validation.` : `L'étape « ${last.step} » est déjà en cours.`);
    }
    if (creation.currentStep === "build" && last?.step === "build" && last.status === "succeeded") {
      throw new ConflictException("La création est déjà construite.");
    }
    // A step starts a new session: it reads the validated files of the previous steps.
    return this.jobs.enqueueClaude({ creationId: id, slug: creation.slug, step: creation.currentStep });
  }

  private async reviewedJob(id: string) {
    const last = await this.lastClaudeJob(id);
    if (!last || last.status !== "waiting_review") throw new ConflictException("Aucune étape n'attend de validation.");
    return last;
  }

  /**
   * Checkpoint approved: the next step starts. After the build, a one-shot création gets its deliverable
   * (video, image or carousel); a template gets its first iteration, rendered with the declared defaults.
   */
  async approve(id: string, { confirmBudget }: ApproveBody = {}) {
    const creation = await this.get(id);
    const reviewed = await this.reviewedJob(id);
    if (reviewed.step === "variables") {
      const { proposed, errors } = await readCreationVariables(resolveWorkspaceDir(), creation.slug);
      if (errors.length > 0) throw new BadRequestException(errors.join(" ; "));
      if (!proposed?.length) throw new BadRequestException("Un template a besoin d'au moins une variable.");
    }
    await this.db.update(jobs).set({ status: "succeeded", updatedAt: new Date() }).where(eq(jobs.id, reviewed.id));

    const next = reviewed.step ? nextStep(reviewed.step, creation) : null;
    if (!next) return creation.kind === "template" ? this.firstIteration(creation) : this.render(id, {});
    await this.setCreation(id, { currentStep: next });
    return this.jobs.enqueueClaude({ creationId: id, slug: creation.slug, step: next, ...(confirmBudget ? { confirmBudget } : {}) });
  }

  /**
   * Keyframes or shots generated again, from their review or after the budget stopped them: the step under review
   * (or failed) runs again on the chosen scenes only. A comment rewrites their prompt first.
   */
  async regenerateShots(id: string, request: ShotsRequest) {
    const creation = await this.get(id);
    if (creation.type !== "realistic") throw new BadRequestException("Seule une vidéo réaliste génère des plans.");
    const last = await this.lastClaudeJob(id);
    const step = last?.step;
    if (!last || (step !== "keyframes" && step !== "shots") || !["waiting_review", "failed"].includes(last.status))
      throw new ConflictException("Les plans se régénèrent depuis la revue des images clés ou des plans.");
    if (request.pass === "final" && step !== "shots") throw new BadRequestException("Le rendu final se lance depuis la revue des plans.");
    if (request.pass === "final" && !request.only?.length) throw new BadRequestException("Choisis les plans à passer en rendu final.");
    if (last.status === "waiting_review") await this.db.update(jobs).set({ status: "succeeded", updatedAt: new Date() }).where(eq(jobs.id, last.id));
    return this.jobs.enqueueClaude({
      creationId: id,
      slug: creation.slug,
      step,
      ...(request.only ? { only: request.only } : {}),
      ...(request.feedback ? { feedback: request.feedback } : {}),
      ...(request.pass ? { pass: request.pass } : {}),
      ...(request.confirmBudget ? { confirmBudget: true } : {}),
    });
  }

  /** Checkpoint commented: the same session resumes on the same step with the feedback. */
  async feedback(id: string, text: string) {
    const creation = await this.get(id);
    const reviewed = await this.reviewedJob(id);
    await this.db.update(jobs).set({ status: "succeeded", updatedAt: new Date() }).where(eq(jobs.id, reviewed.id));
    return this.jobs.enqueueClaude({
      creationId: id,
      slug: creation.slug,
      step: reviewed.step ?? creation.currentStep,
      feedback: text,
      resumeSessionId: reviewed.claudeSessionId ?? creation.claudeSessionId ?? undefined,
    });
  }

  /** Once per template: an iteration with the declared defaults, rendered so the template has a preview. */
  private async firstIteration(creation: Creation) {
    const [existing] = await this.db.select({ id: iterations.id }).from(iterations).where(eq(iterations.creationId, creation.id)).limit(1);
    if (existing) return existing;
    const { declared } = await readCreationVariables(resolveWorkspaceDir(), creation.slug);
    const deliverable = deliverableFor(creation);
    const [iteration] = await this.db
      .insert(iterations)
      .values({ creationId: creation.id, name: "Valeurs par défaut", values: defaultVariableValues(declared), format: deliverable.format })
      .returning();
    await this.jobs.enqueueRender({
      creationId: creation.id,
      slug: creation.slug,
      iterationId: iteration.id,
      variables: iteration.values,
      ...deliverable,
    });
    return iteration;
  }

  async template(id: string) {
    const creation = await this.get(id);
    if (creation.kind !== "template") throw new BadRequestException("Cette création n'est pas un template.");
    return creation;
  }

  async variables(id: string) {
    const creation = await this.get(id);
    return readCreationVariables(resolveWorkspaceDir(), creation.slug);
  }

  /** The user's edit of the contract: during the review of the variables, or once the template is built. */
  async saveVariables(id: string, variables: CompositionVariable[]) {
    const creation = await this.template(id);
    const last = await this.lastClaudeJob(id);
    if (last && ACTIVE.includes(last.status)) throw new ConflictException("Claude travaille sur ce template : attends la fin de l'étape.");
    if (creation.currentStep === "brief") throw new ConflictException("Les variables se proposent après le brief.");
    await writeCreationVariables(resolveWorkspaceDir(), creation.slug, variables);
    await this.setCreation(id, {});
    return readCreationVariables(resolveWorkspaceDir(), creation.slug);
  }

  /** After the build, an edited contract goes back to Claude: the build is redone and reviewed again. */
  async applyVariables(id: string) {
    const creation = await this.template(id);
    const last = await this.lastClaudeJob(id);
    if (!(creation.currentStep === "build" && last?.step === "build" && last.status === "succeeded")) {
      throw new ConflictException("La mise à jour des variables se fait sur un template construit.");
    }
    return this.jobs.enqueueClaude({
      creationId: id,
      slug: creation.slug,
      step: "build",
      feedback:
        "Le contrat de variables a changé : aligne la composition sur VARIABLES.json (déclaration data-composition-variables et liaisons), sans rien changer d'autre.",
      resumeSessionId: creation.claudeSessionId ?? undefined,
    });
  }

  /**
   * A render of the création. Without a format, its deliverable; an image or a carousel is captured at its
   * fixed times, a video's PNG frames are spread over it by the worker.
   */
  async render(id: string, request: RenderRequestBody, iterationId?: string) {
    const creation = await this.get(id);
    const deliverable = deliverableFor(creation);
    const format = request.format ?? deliverable.format;
    if (!allowedFormats(creation.type).includes(format)) throw new BadRequestException(`Format ${format} indisponible pour ce type de création.`);
    const at = request.at ?? (creation.type !== "video" && STILLS.includes(format) ? deliverable.at : undefined);
    return this.jobs.enqueueRender({
      creationId: id,
      slug: creation.slug,
      format,
      iterationId,
      variables: request.variables,
      at,
      frames: at ? undefined : request.frames,
    });
  }

  /** After the editor added or removed slides: the deliverable is captured once per slide. */
  async setSlideCount(id: string, slideCount: number) {
    const [row] = await this.db.update(creations).set({ slideCount, updatedAt: new Date() }).where(eq(creations.id, id)).returning();
    return row;
  }
}
