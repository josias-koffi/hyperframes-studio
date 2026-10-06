import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createDatabaseClient, createJobReporter, renders, type Database, type Publish } from "@studio/db";
import { applyVariableDefaults, loadEnvironmentFiles, QUEUES, renderJobSchema, resolveWorkspaceDir, type RenderJob } from "@studio/shared";
import { createStorage, storageKeys, type Storage } from "@studio/storage";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { compositionDuration, planRender, postFrameTimes } from "./render-args";

const exec = promisify(execFile);

loadEnvironmentFiles();

const config = {
  redisUrl: process.env.REDIS_URL?.trim() || "redis://localhost:6390",
  workspaceDir: resolveWorkspaceDir(),
  /**
   * The HyperFrames CLI pinned in the image (`npm i -g hyperframes@<version>`). A command with arguments is
   * allowed, for a host without the global install: `npx --yes hyperframes@<version>`.
   */
  hyperframes: (process.env.HYPERFRAMES_BIN?.trim() || "hyperframes").split(/\s+/),
  concurrency: Number.parseInt(process.env.RENDER_CONCURRENCY ?? "", 10) || 1,
};

async function processRender(job: RenderJob, deps: { db: Database; storage: Storage; publish: Publish }) {
  const report = createJobReporter(deps.db, deps.publish, job.jobId);
  const outDir = await mkdtemp(join(tmpdir(), "render-"));
  await report.status("running");
  try {
    let variablesFile: string | undefined;
    let dir = `videos/${job.slug}`;
    if (job.variables && Object.keys(job.variables).length) {
      if (job.format === "png") {
        // `snapshot` has no --variables: capture a copy whose defaults are the values.
        dir = join(outDir, "composition");
        await cp(join(config.workspaceDir, "videos", job.slug), dir, { recursive: true });
        const index = join(dir, "index.html");
        await writeFile(index, applyVariableDefaults(await readFile(index, "utf8"), job.variables));
      } else {
        variablesFile = join(outDir, "variables.json");
        await writeFile(variablesFile, JSON.stringify(job.variables));
      }
    }
    if (job.format === "png" && !job.at?.length) {
      const duration = compositionDuration(await readFile(resolve(config.workspaceDir, dir, "index.html"), "utf8"));
      job.at = duration ? postFrameTimes(duration, job.frames ?? 3) : [0];
    }
    const shotsDir = join(outDir, "shots");
    const plan = planRender(job, { dir, outDir: job.format === "png" ? shotsDir : outDir, variablesFile });
    await report.event({ kind: "tool", name: "hyperframes", summary: plan.args.join(" ") });
    const [bin, ...prefix] = config.hyperframes;
    await exec(bin, [...prefix, ...plan.args], { cwd: config.workspaceDir, maxBuffer: 64 * 1024 * 1024 });

    const outputs = plan.outputs.length
      ? plan.outputs
      : (await readdir(shotsDir)).filter((f) => f.endsWith(".png")).sort().map((f) => join(shotsDir, f));
    const renderId = randomUUID();
    const keys: string[] = [];
    for (const output of outputs) {
      const key = storageKeys.render(job.projectId, renderId, basename(output));
      await deps.storage.uploadFile(key, output, plan.contentType);
      keys.push(key);
    }
    await deps.db.insert(renders).values({
      id: renderId,
      projectId: job.projectId,
      jobId: job.jobId,
      format: job.format,
      variables: job.variables ?? null,
      storageKeys: keys,
    });
    await report.event({ kind: "result", ok: true, text: `${keys.length} fichier(s) exporté(s)` });
    await report.status("succeeded", { resultText: keys.join("\n") });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await report.event({ kind: "log", level: "error", text: message.slice(-4000) });
    await report.status("failed", { resultText: message.slice(-4000) });
    throw error;
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

async function main() {
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
  const publisher = new IORedis(config.redisUrl);
  const { db, close } = createDatabaseClient();
  const storage = createStorage();
  await storage.ensureBucket();

  const worker = new Worker(
    QUEUES.render,
    (job) => processRender(renderJobSchema.parse(job.data), { db, storage, publish: (c, m) => publisher.publish(c, m) }),
    { connection, concurrency: config.concurrency, lockDuration: 10 * 60 * 1000 },
  );
  worker.on("failed", (job, error) => console.error(`[render-worker] job ${job?.id} failed:`, error.message));
  console.log(`[render-worker] listening on ${QUEUES.render} (concurrency=${config.concurrency})`);

  const shutdown = async () => {
    await worker.close();
    await close();
    publisher.disconnect();
    connection.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  console.error("[render-worker] failed to start", error);
  process.exit(1);
});
