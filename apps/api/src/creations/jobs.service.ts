import { randomUUID } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { creations, jobEvents, jobs, projects, type Database } from "@studio/db";
import type { ClaudeJob, RenderJob } from "@studio/shared";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { currentUserId } from "../auth/request-context";
import { AiService } from "../ai/ai.service";
import { DATABASE } from "../database/database.module";
import { QueuesService } from "../queues/queues.module";

@Injectable()
export class JobsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(QueuesService) private readonly queues: QueuesService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  /**
   * Records the job, then queues it under the same id so the row and the BullMQ job match. The signed-in person's
   * AI settings are frozen into it: the runner queues the following steps with the same ones.
   */
  async enqueueClaude(request: Omit<ClaudeJob, "jobId">) {
    const input = { ...request, ai: request.ai ?? (await this.ai.resolveForCurrentUser()) };
    const jobId = randomUUID();
    const [row] = await this.db
      .insert(jobs)
      .values({ id: jobId, creationId: input.creationId, kind: "claude", step: input.step, input })
      .returning();
    await this.queues.claude.add(input.step, { ...input, jobId }, { jobId });
    return row;
  }

  async enqueueRender(input: Omit<RenderJob, "jobId">) {
    const jobId = randomUUID();
    const [row] = await this.db
      .insert(jobs)
      .values({ id: jobId, creationId: input.creationId, iterationId: input.iterationId ?? null, kind: "render", input })
      .returning();
    await this.queues.render.add(input.format, { ...input, jobId }, { jobId });
    return row;
  }

  /** The signed-in person's job (through its création's project). */
  async get(id: string) {
    const [row] = await this.db
      .select({ job: jobs })
      .from(jobs)
      .innerJoin(creations, eq(creations.id, jobs.creationId))
      .innerJoin(projects, eq(projects.id, creations.projectId))
      .where(and(eq(jobs.id, id), eq(projects.ownerId, currentUserId())));
    if (!row) throw new NotFoundException("job not found");
    return row.job;
  }

  /** A job's status, for a stream whose ownership `get` already checked. */
  async status(id: string) {
    const [row] = await this.db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, id));
    if (!row) throw new NotFoundException("job not found");
    return row.status;
  }

  /** The création's own jobs: iteration renders live on their iteration. Callers check the création first. */
  listForCreation(creationId: string) {
    return this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.creationId, creationId), isNull(jobs.iterationId)))
      .orderBy(desc(jobs.createdAt))
      .limit(100);
  }

  listForIteration(iterationId: string) {
    return this.db.select().from(jobs).where(eq(jobs.iterationId, iterationId)).orderBy(desc(jobs.createdAt)).limit(50);
  }

  events(jobId: string) {
    return this.db.select().from(jobEvents).where(eq(jobEvents.jobId, jobId)).orderBy(asc(jobEvents.seq));
  }
}
