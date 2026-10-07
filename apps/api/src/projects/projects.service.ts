import { BadGatewayException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { jobs, projects, type Database } from "@studio/db";
import { nextStep } from "@studio/shared";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE } from "../database/database.module";
import { JobsService } from "../jobs/jobs.service";
import type { CreateProject, RenderRequest, UpdateProject } from "./projects.schemas";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  list() {
    return this.db.select().from(projects).orderBy(desc(projects.updatedAt));
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

  /** Checkpoint approved: the next step starts; after the build, the first render does. */
  async approve(id: string) {
    const project = await this.get(id);
    const reviewed = await this.reviewedJob(id);
    await this.db.update(jobs).set({ status: "succeeded", updatedAt: new Date() }).where(eq(jobs.id, reviewed.id));

    const next = reviewed.step ? nextStep(reviewed.step) : null;
    if (!next) return this.render(id, { format: "mp4" });
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

  async render(id: string, request: RenderRequest) {
    const project = await this.get(id);
    return this.jobs.enqueueRender({ projectId: id, slug: project.slug, ...request });
  }

  /**
   * The editor runs in the hf-studio gateway (one project at a time) and writes to the same files as Claude:
   * not while a step is generating.
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
    return { url: process.env.HF_STUDIO_PUBLIC_URL?.trim() || base };
  }
}
