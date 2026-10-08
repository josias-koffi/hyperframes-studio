import { randomUUID } from "node:crypto";
import { createDatabaseClient, jobs } from "@studio/db";
import { claudeJobSchema, loadEnvironmentFiles, QUEUES, type ClaudeJob } from "@studio/shared";
import { createStorage } from "@studio/storage";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { resolveRunnerConfig } from "./config";
import { processClaudeJob } from "./process-job";
import { syncWorkspaceSkeleton } from "./workspace";

loadEnvironmentFiles();

async function main() {
  const config = resolveRunnerConfig();
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const publisher = new IORedis(config.redisUrl);
  const { db, close } = createDatabaseClient();
  const storage = createStorage();
  const queue = new Queue(QUEUES.claude, { connection });

  if (config.skeletonDir) {
    await syncWorkspaceSkeleton(config.skeletonDir, config.workspaceDir);
    console.log(`[claude-runner] workspace skeleton synced into ${config.workspaceDir}`);
  }

  const enqueueNext = async (next: Omit<ClaudeJob, "jobId">) => {
    const jobId = randomUUID();
    await db.insert(jobs).values({ id: jobId, creationId: next.creationId, kind: "claude", step: next.step, input: next });
    await queue.add(next.step, { ...next, jobId }, { jobId });
  };

  // One Claude session at a time: the subscription quota is shared by every job.
  const worker = new Worker(
    QUEUES.claude,
    async (job) =>
      processClaudeJob(claudeJobSchema.parse(job.data), {
        config,
        db,
        storage,
        publish: (channel, message) => publisher.publish(channel, message),
        enqueueNext,
      }),
    // A step interrupted by a restart fails instead of running again on its own: a Claude turn costs.
    { connection, concurrency: 1, lockDuration: 5 * 60 * 1000, maxStalledCount: 0 },
  );
  worker.on("failed", (job, error) => console.error(`[claude-runner] job ${job?.id} failed:`, error.message));
  console.log(`[claude-runner] listening on ${QUEUES.claude} (enabled=${config.enabled})`);

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await close();
    publisher.disconnect();
    connection.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  console.error("[claude-runner] failed to start", error);
  process.exit(1);
});
