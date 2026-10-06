import { jobEventsChannel, type JobStatus, type StudioEvent } from "@studio/shared";
import { eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { jobEvents, jobs } from "./schema";

export type Publish = (channel: string, message: string) => Promise<unknown>;

/**
 * Used by the workers: stores each event of a job (for replay) and publishes it
 * on the job's Redis channel (for the live view). The sequence number makes the
 * replay + live merge in the API idempotent.
 */
export function createJobReporter(db: Database, publish: Publish, jobId: string) {
  let seq = 0;
  let ready: Promise<void> | null = null;

  async function init() {
    const [row] = await db
      .select({ max: sql<number>`coalesce(max(${jobEvents.seq}), 0)` })
      .from(jobEvents)
      .where(eq(jobEvents.jobId, jobId));
    seq = Number(row?.max ?? 0);
  }

  return {
    async event(event: StudioEvent): Promise<void> {
      ready ??= init();
      await ready;
      seq += 1;
      await db.insert(jobEvents).values({ jobId, seq, event });
      await publish(jobEventsChannel(jobId), JSON.stringify({ seq, event }));
    },

    async status(status: JobStatus, fields: Partial<typeof jobs.$inferInsert> = {}): Promise<void> {
      const now = new Date();
      await db
        .update(jobs)
        .set({
          ...fields,
          status,
          updatedAt: now,
          ...(status === "running" ? { startedAt: now } : {}),
          ...(["succeeded", "failed", "cancelled", "waiting_review"].includes(status) ? { finishedAt: now } : {}),
        })
        .where(eq(jobs.id, jobId));
      await publish(jobEventsChannel(jobId), JSON.stringify({ status }));
    },
  };
}
