import { randomUUID } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { jobEvents, jobs, type Database } from "@studio/db";
import type { ClaudeJob, RenderJob } from "@studio/shared";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../database/database.module";
import { QueuesService } from "../queues/queues.module";

@Injectable()
export class JobsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(QueuesService) private readonly queues: QueuesService,
  ) {}

  /** Records the job, then queues it under the same id so the row and the BullMQ job match. */
  async enqueueClaude(input: Omit<ClaudeJob, "jobId">) {
    const jobId = randomUUID();
    const [row] = await this.db
      .insert(jobs)
      .values({ id: jobId, projectId: input.projectId, kind: "claude", step: input.step, input })
      .returning();
    await this.queues.claude.add(input.step, { ...input, jobId }, { jobId });
    return row;
  }

  async enqueueRender(input: Omit<RenderJob, "jobId">) {
    const jobId = randomUUID();
    const [row] = await this.db.insert(jobs).values({ id: jobId, projectId: input.projectId, iterationId: input.iterationId ?? null, kind: "render", input }).returning();
    await this.queues.render.add(input.format, { ...input, jobId }, { jobId });
    return row;
  }

  async get(id: string) {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id));
    if (!row) throw new NotFoundException("job not found");
    return row;
  }

  /** The project's own jobs: iteration renders live on their iteration. */
  listForProject(projectId: string) {
    return this.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.projectId, projectId), isNull(jobs.iterationId)))
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
