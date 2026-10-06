import { randomUUID } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { jobEvents, jobs, type Database } from "@studio/db";
import type { ClaudeJob, RenderJob } from "@studio/shared";
import { asc, desc, eq } from "drizzle-orm";
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
    const [row] = await this.db.insert(jobs).values({ id: jobId, projectId: input.projectId, kind: "render", input }).returning();
    await this.queues.render.add(input.format, { ...input, jobId }, { jobId });
    return row;
  }

  async get(id: string) {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id));
    if (!row) throw new NotFoundException("job not found");
    return row;
  }

  listForProject(projectId: string) {
    return this.db.select().from(jobs).where(eq(jobs.projectId, projectId)).orderBy(desc(jobs.createdAt)).limit(100);
  }

  events(jobId: string) {
    return this.db.select().from(jobEvents).where(eq(jobEvents.jobId, jobId)).orderBy(asc(jobEvents.seq));
  }
}
