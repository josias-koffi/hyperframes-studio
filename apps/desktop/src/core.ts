import { bootstrap } from "@studio/api/dist/main";
import { startClaudeRunner } from "@studio/claude-runner/dist/main";
import { createDatabaseClient, jobs, runMigrations } from "@studio/db";
import { startRenderWorker } from "@studio/render-worker/dist/main";
import { inArray } from "drizzle-orm";

/**
 * The desktop app's backend in one process: the API and both workers share its embedded Postgres (PGlite) and its
 * in-memory queue, where the servers run them in containers around Postgres and Redis. Its environment comes from
 * the Electron process (`DATABASE_URL=pglite:…`, `REDIS_URL=memory`, `STORAGE_DIR`).
 */
async function main() {
  console.log(`[core] migrations applied from ${await runMigrations()}`);
  await failInterruptedJobs();

  const api = await bootstrap();
  const runner = await startClaudeRunner();
  const renders = await startRenderWorker();
  console.log(`[core] ready on ${process.env.API_URL}`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await Promise.allSettled([runner.close(), renders.close()]);
    await api.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

/** A queue in memory does not outlive the app: the jobs it held when the app quit will never run. */
async function failInterruptedJobs() {
  const { db, close } = createDatabaseClient();
  try {
    const failed = await db
      .update(jobs)
      .set({ status: "failed", resultText: "Interrompu : l'application a été fermée pendant ce job.", finishedAt: new Date(), updatedAt: new Date() })
      .where(inArray(jobs.status, ["queued", "running"]))
      .returning({ id: jobs.id });
    if (failed.length) console.log(`[core] ${failed.length} job(s) interrupted by the last quit marked failed`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error("[core] failed to start", error);
  process.exit(1);
});
