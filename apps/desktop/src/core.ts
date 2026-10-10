import { createDatabaseClient, jobs, runMigrations } from "@studio/db";
import { loadEnvironmentFiles } from "@studio/shared";
import { inArray } from "drizzle-orm";

/** Under tsx (`pnpm dev`) the apps load from their sources, watched; in the app, from their builds. */
const BUILD = __filename.endsWith(".ts") ? "src" : "dist";

/**
 * The studio's backend in one process: the API and both workers share its embedded Postgres (PGlite) and its
 * in-memory queue. The Electron process hands it its environment; `pnpm dev` reads `.env`.
 */
async function main() {
  loadEnvironmentFiles();
  console.log(`[core] migrations applied from ${await runMigrations()}`);
  await failInterruptedJobs();

  const { bootstrap } = (await import(`@studio/api/${BUILD}/main`)) as typeof import("@studio/api/dist/main");
  const { startClaudeRunner } = (await import(`@studio/claude-runner/${BUILD}/main`)) as typeof import("@studio/claude-runner/dist/main");
  const { startRenderWorker } = (await import(`@studio/render-worker/${BUILD}/main`)) as typeof import("@studio/render-worker/dist/main");
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

/** The queue lives in memory and does not outlive the app: the jobs it held when the app quit will never run. */
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
