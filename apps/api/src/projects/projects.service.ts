import { rm } from "node:fs/promises";
import { join } from "node:path";
import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { assets, iterations, jobs, projects, renders, type Database } from "@studio/db";
import { defaultVariableValues, nextStep, resolveWorkspaceDir, type CompositionVariable } from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { DATABASE } from "../database/database.module";
import { JobsService } from "../jobs/jobs.service";
import { STORAGE } from "../storage/storage.module";
import { readProjectVariables, writeProjectVariables } from "./project-variables";
import type { CreateProject, ListProjectsQuery, RenderRequest, UpdateProject } from "./projects.schemas";

type Project = typeof projects.$inferSelect;

const ACTIVE = ["queued", "running"];

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Projects of one kind; a template also carries how many variables and iterations it has. */
  async list(query: ListProjectsQuery = {}) {
    const rows = await this.db
      .select()
      .from(projects)
      .where(query.kind ? eq(projects.kind, query.kind) : undefined)
      .orderBy(desc(projects.updatedAt));
    const templates = rows.filter((row) => row.kind === "template");
    if (templates.length === 0) return rows.map((row) => ({ ...row, variableCount: null, iterationCount: null }));

    const counts = await this.db
      .select({ projectId: iterations.projectId, total: count() })
      .from(iterations)
      .where(inArray(iterations.projectId, templates.map((row) => row.id)))
      .groupBy(iterations.projectId);
    const iterationCount = new Map(counts.map((row) => [row.projectId, row.total]));
    const workspace = resolveWorkspaceDir();
    return Promise.all(
      rows.map(async (row) => {
        if (row.kind !== "template") return { ...row, variableCount: null, iterationCount: null };
        const { proposed, declared } = await readProjectVariables(workspace, row.slug);
        return { ...row, variableCount: (declared.length > 0 ? declared : (proposed ?? [])).length, iterationCount: iterationCount.get(row.id) ?? 0 };
      }),
    );
  }

  async get(id: string) {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new NotFoundException("project not found");
    return row;
  }

  async create(input: CreateProject) {
    const [existing] = await this.db.select({ id: projects.id }).from(projects).where(eq(projects.slug, input.slug));
    if (existing) throw new ConflictException("Ce nom de dossier est déjà utilisé par un autre projet.");
    const [row] = await this.db.insert(projects).values(input).returning();
    return row;
  }

  async update(id: string, input: UpdateProject) {
    await this.get(id);
    const [row] = await this.db.update(projects).set({ ...input, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return row;
  }

  /**
   * Removes the project, its renders and assets from the bucket and its video folder. Refused while Claude
   * works on it: the runner would write into a folder that no longer exists.
   */
  async remove(id: string) {
    const project = await this.get(id);
    const last = await this.activeClaudeJob(id);
    if (last && ACTIVE.includes(last.status)) throw new ConflictException("Claude travaille sur ce projet : attends la fin de l'étape.");

    const [renderRows, assetRows] = await Promise.all([
      this.db.select({ keys: renders.storageKeys }).from(renders).where(eq(renders.projectId, id)),
      this.db.select({ key: assets.storageKey }).from(assets).where(eq(assets.projectId, id)),
    ]);
    await this.db.delete(projects).where(eq(projects.id, id));
    const keys = [...renderRows.flatMap((row) => row.keys), ...assetRows.map((row) => row.key)];
    await Promise.allSettled(keys.map((key) => this.storage.delete(key)));
    await rm(join(resolveWorkspaceDir(), "videos", project.slug), { recursive: true, force: true });
    return { id };
  }

  private async activeClaudeJob(projectId: string) {
    const [row] = await this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.projectId, projectId), eq(jobs.kind, "claude")))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Starts (or restarts after a failure) the project's current step. */
  async generate(id: string) {
    const project = await this.get(id);
    const last = await this.activeClaudeJob(id);
    if (last && ["queued", "running", "waiting_review"].includes(last.status)) {
      throw new ConflictException(last.status === "waiting_review" ? `L'étape « ${last.step} » attend ta validation.` : `L'étape « ${last.step} » est déjà en cours.`);
    }
    if (project.currentStep === "build" && last?.step === "build" && last.status === "succeeded") {
      throw new ConflictException("La vidéo est déjà construite.");
    }
    return this.jobs.enqueueClaude({
      projectId: id,
      slug: project.slug,
      step: project.currentStep,
      resumeSessionId: project.claudeSessionId ?? undefined,
    });
  }

  private async reviewedJob(id: string) {
    const last = await this.activeClaudeJob(id);
    if (!last || last.status !== "waiting_review") throw new ConflictException("Aucune étape n'attend de validation.");
    return last;
  }

  /**
   * Checkpoint approved: the next step starts. After the build, a one-shot video gets its first render; a
   * template gets its first iteration, rendered with the declared defaults.
   */
  async approve(id: string) {
    const project = await this.get(id);
    const reviewed = await this.reviewedJob(id);
    if (reviewed.step === "variables") {
      const { proposed, errors } = await readProjectVariables(resolveWorkspaceDir(), project.slug);
      if (errors.length > 0) throw new BadRequestException(errors.join(" ; "));
      if (!proposed?.length) throw new BadRequestException("Un template a besoin d'au moins une variable.");
    }
    await this.db.update(jobs).set({ status: "succeeded", updatedAt: new Date() }).where(eq(jobs.id, reviewed.id));

    const next = reviewed.step ? nextStep(reviewed.step, project.kind) : null;
    if (!next) return project.kind === "template" ? this.firstIteration(project) : this.render(id, { format: "mp4" });
    await this.db.update(projects).set({ currentStep: next, updatedAt: new Date() }).where(eq(projects.id, id));
    return this.jobs.enqueueClaude({
      projectId: id,
      slug: project.slug,
      step: next,
      resumeSessionId: project.claudeSessionId ?? undefined,
    });
  }

  /** Checkpoint commented: the same session resumes on the same step with the feedback. */
  async feedback(id: string, text: string) {
    const project = await this.get(id);
    const reviewed = await this.reviewedJob(id);
    await this.db.update(jobs).set({ status: "succeeded", updatedAt: new Date() }).where(eq(jobs.id, reviewed.id));
    return this.jobs.enqueueClaude({
      projectId: id,
      slug: project.slug,
      step: reviewed.step ?? project.currentStep,
      feedback: text,
      resumeSessionId: reviewed.claudeSessionId ?? project.claudeSessionId ?? undefined,
    });
  }

  /** Once per template: an iteration with the declared defaults, rendered so the template has a preview. */
  private async firstIteration(project: Project) {
    const [existing] = await this.db.select({ id: iterations.id }).from(iterations).where(eq(iterations.projectId, project.id)).limit(1);
    if (existing) return existing;
    const { declared } = await readProjectVariables(resolveWorkspaceDir(), project.slug);
    const [iteration] = await this.db
      .insert(iterations)
      .values({ projectId: project.id, name: "Valeurs par défaut", values: defaultVariableValues(declared) })
      .returning();
    await this.jobs.enqueueRender({ projectId: project.id, slug: project.slug, format: "mp4", iterationId: iteration.id, variables: iteration.values });
    return iteration;
  }

  private async template(id: string) {
    const project = await this.get(id);
    if (project.kind !== "template") throw new BadRequestException("Ce projet n'est pas un template.");
    return project;
  }

  async variables(id: string) {
    const project = await this.get(id);
    return readProjectVariables(resolveWorkspaceDir(), project.slug);
  }

  /** The user's edit of the contract: during the review of the variables, or once the template is built. */
  async saveVariables(id: string, variables: CompositionVariable[]) {
    const project = await this.template(id);
    const last = await this.activeClaudeJob(id);
    if (last && ACTIVE.includes(last.status)) throw new ConflictException("Claude travaille sur ce template : attends la fin de l'étape.");
    if (project.currentStep === "brief") throw new ConflictException("Les variables se proposent après le brief.");
    await writeProjectVariables(resolveWorkspaceDir(), project.slug, variables);
    await this.db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, id));
    return readProjectVariables(resolveWorkspaceDir(), project.slug);
  }

  /** After the build, an edited contract goes back to Claude: the build is redone and reviewed again. */
  async applyVariables(id: string) {
    const project = await this.template(id);
    const last = await this.activeClaudeJob(id);
    if (!(project.currentStep === "build" && last?.step === "build" && last.status === "succeeded")) {
      throw new ConflictException("La mise à jour des variables se fait sur un template construit.");
    }
    return this.jobs.enqueueClaude({
      projectId: id,
      slug: project.slug,
      step: "build",
      feedback:
        "Le contrat de variables a changé : aligne la composition sur VARIABLES.json (déclaration data-composition-variables et liaisons), sans rien changer d'autre.",
      resumeSessionId: project.claudeSessionId ?? undefined,
    });
  }

  async render(id: string, request: RenderRequest) {
    const project = await this.get(id);
    return this.jobs.enqueueRender({ projectId: id, slug: project.slug, ...request });
  }

  /**
   * The editor runs in the hf-studio gateway (every opened project stays open) and writes to the same files as
   * Claude: not while a step is generating. The Studio page picks its project from the URL hash.
   */
  async openStudio(id: string) {
    const project = await this.get(id);
    const last = await this.activeClaudeJob(id);
    if (last && ["queued", "running"].includes(last.status)) {
      throw new ConflictException("Claude travaille sur ce projet : attends la fin de l'étape pour ouvrir le Studio.");
    }
    const base = process.env.HF_STUDIO_URL?.trim() || "http://localhost:3344";
    const token = process.env.HF_STUDIO_TOKEN?.trim();
    const response = await fetch(`${base}/__gateway/open`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ slug: project.slug }),
    }).catch(() => null);
    if (!response?.ok) {
      const detail = response ? ((await response.json().catch(() => null)) as { message?: string } | null)?.message : null;
      throw new BadGatewayException(detail ?? "Le service Studio HyperFrames (hf-studio) est injoignable.");
    }
    const publicUrl = (process.env.HF_STUDIO_PUBLIC_URL?.trim() || base).replace(/\/+$/, "");
    return { url: `${publicUrl}/#project/${project.slug}` };
  }
}
