import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createDatabaseClient, createJobBus, createJobReporter, renders, type Database, type Publish } from "@studio/db";
import { applyVariableDefaults, loadEnvironmentFiles, QUEUES, renderJobSchema, resolveWorkspaceDir, type RenderJob } from "@studio/shared";
import { createStorage, storageKeys, type Storage } from "@studio/storage";
import { assemblePdf } from "./pdf";
import { compositionDuration, contentTypeOf, isStill, planRender, postFrameTimes, sortShots } from "./render-args";

const exec = promisify(execFile);

if (require.main === module) loadEnvironmentFiles();

const config = {
  workspaceDir: resolveWorkspaceDir(),
  /**
   * The HyperFrames CLI pinned in the image (`npm i -g hyperframes@<version>`). A command with arguments is
   * allowed, for a host without the global install: `npx --yes hyperframes@<version>`.
   */
  hyperframes: (process.env.HYPERFRAMES_BIN?.trim() || "hyperframes").split(/\s+/),
  concurrency: Number.parseInt(process.env.RENDER_CONCURRENCY ?? "", 10) || 1,
};

/** Headless Chrome sometimes misses its first navigation: a still gets one more try before the job fails. */
async function runHyperframes(args: string[], attempts: number) {
  const [bin, ...prefix] = config.hyperframes;
  for (let attempt = 1; ; attempt++) {
    try {
      return await exec(bin, [...prefix, ...args], { cwd: config.workspaceDir, maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      if (attempt >= attempts) throw error;
    }
  }
}

async function processRender(job: RenderJob, deps: { db: Database; storage: Storage; publish: Publish }) {
  const report = createJobReporter(deps.db, deps.publish, job.jobId);
  const outDir = await mkdtemp(join(tmpdir(), "render-"));
  const still = isStill(job.format);
  await report.status("running");
  try {
    let variablesFile: string | undefined;
    let dir = `videos/${job.slug}`;
    if (job.variables && Object.keys(job.variables).length) {
      if (still) {
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
    if (still && !job.at?.length) {
      const duration = compositionDuration(await readFile(resolve(config.workspaceDir, dir, "index.html"), "utf8"));
      job.at = duration ? postFrameTimes(duration, job.frames ?? 3) : [0];
    }
    const shotsDir = join(outDir, "shots");
    const plan = planRender(job, { dir, outDir: still ? shotsDir : outDir, variablesFile });
    await report.event({ kind: "tool", name: "hyperframes", summary: plan.args.join(" ") });
    await runHyperframes(plan.args, still ? 2 : 1);

    let outputs = plan.outputs;
    if (still) {
      outputs = sortShots(await readdir(shotsDir)).map((file) => join(shotsDir, file));
      if (job.format === "pdf") {
        // A carousel: slide-01.png… for Instagram, and the same slides as one PDF for LinkedIn.
        const slides: string[] = [];
        for (const [index, shot] of outputs.entries()) {
          const slide = join(outDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
          await rename(shot, slide);
          slides.push(slide);
        }
        const pdf = join(outDir, `${job.slug}.pdf`);
        await assemblePdf(slides, pdf, job.slug);
        outputs = [...slides, pdf];
      }
    }

    const renderId = randomUUID();
    const keys: string[] = [];
    for (const output of outputs) {
      const key = storageKeys.render(job.creationId, renderId, basename(output));
      await deps.storage.uploadFile(key, output, contentTypeOf(output));
      keys.push(key);
    }
    await deps.db.insert(renders).values({
      id: renderId,
      creationId: job.creationId,
      jobId: job.jobId,
      iterationId: job.iterationId ?? null,
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

/** Starts the worker; resolves with its stop. The desktop app's core process calls it, next to the API. */
export async function startRenderWorker() {
  const bus = createJobBus();
  const { db, close } = createDatabaseClient();
  const storage = createStorage();
  await storage.ensureBucket();

  const worker = bus.work(QUEUES.render, (data) => processRender(renderJobSchema.parse(data), { db, storage, publish: bus.publish }), {
    concurrency: config.concurrency,
    lockDuration: 10 * 60 * 1000,
    onFailed: (jobId, error) => console.error(`[render-worker] job ${jobId} failed:`, error.message),
  });
  console.log(`[render-worker] listening on ${QUEUES.render} (concurrency=${config.concurrency})`);

  return {
    async close() {
      await worker.close();
      await bus.close();
      await close();
    },
  };
}

if (require.main === module) {
  startRenderWorker()
    .then((worker) => {
      const shutdown = () => worker.close().finally(() => process.exit(0));
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    })
    .catch((error: unknown) => {
      console.error("[render-worker] failed to start", error);
      process.exit(1);
    });
}
