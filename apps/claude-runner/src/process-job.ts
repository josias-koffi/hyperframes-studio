import { join } from "node:path";
import { assets, createJobReporter, projects, type Database, type Publish } from "@studio/db";
import { CHECKPOINT_STEPS, isVariablesDiffEmpty, nextStep, type ClaudeJob } from "@studio/shared";
import type { Storage } from "@studio/storage";
import { eq } from "drizzle-orm";
import { buildClaudeArgs } from "./claude-args";
import type { RunnerConfig } from "./config";
import { buildPrompt } from "./prompt";
import { runClaude } from "./run-claude";
import { commitCheckpoint, ensureVideoFolder, missingStepOutputs, storyboardAudio, templateVariablesGap } from "./workspace";

export type ProcessDeps = {
  config: RunnerConfig;
  db: Database;
  storage: Pick<Storage, "downloadToFile">;
  publish: Publish;
  /** Queues the next step when a step without checkpoint succeeds. */
  enqueueNext: (job: Omit<ClaudeJob, "jobId">) => Promise<void>;
};

/** Project assets uploaded in the studio land in `videos/<slug>/assets/uploads/`. */
async function syncAssets(deps: ProcessDeps, projectId: string, slug: string) {
  const rows = await deps.db.select().from(assets).where(eq(assets.projectId, projectId));
  for (const asset of rows) {
    const target = join(deps.config.workspaceDir, "videos", slug, "assets", "uploads", asset.filename);
    await deps.storage.downloadToFile(asset.storageKey, target);
  }
}

export async function processClaudeJob(job: ClaudeJob, deps: ProcessDeps): Promise<void> {
  const { config, db } = deps;
  const report = createJobReporter(db, deps.publish, job.jobId);

  if (!config.enabled) {
    await report.event({ kind: "log", level: "error", text: "Claude jobs are disabled in this environment (CLAUDE_JOBS_ENABLED=false)." });
    await report.status("failed", { resultText: "disabled" });
    return;
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, job.projectId));
  if (!project) throw new Error(`project ${job.projectId} not found`);

  await report.status("running");
  try {
    await ensureVideoFolder(config.workspaceDir, job.slug);
    await syncAssets(deps, project.id, job.slug);

    // A silent video has nothing to produce in the media step: no Claude turn, straight to the build.
    if (job.step === "media" && !job.feedback && (await storyboardAudio(config.workspaceDir, job.slug)) === "aucun") {
      await report.event({ kind: "log", level: "info", text: "Storyboard sans voix ni musique (studio_audio: aucun) : étape sautée." });
      await report.status("succeeded", { resultText: "Vidéo muette : aucun média à produire." });
      await db.update(projects).set({ currentStep: "build", updatedAt: new Date() }).where(eq(projects.id, project.id));
      await deps.enqueueNext({ projectId: project.id, slug: job.slug, step: "build", resumeSessionId: project.claudeSessionId ?? undefined });
      return;
    }

    const prompt = await buildPrompt(config.promptsDir, {
      step: job.step,
      kind: project.kind,
      slug: job.slug,
      workflow: project.workflow,
      brief: project.brief,
      feedback: job.feedback,
    });
    const result = await runClaude({
      bin: config.claudeBin,
      args: buildClaudeArgs({
        prompt,
        resumeSessionId: job.resumeSessionId ?? project.claudeSessionId,
        model: config.stepModels[job.step],
        settingsFile: join(config.workspaceDir, ".claude", "settings.json"),
        addDirs: [config.skillsDir],
      }),
      cwd: config.workspaceDir,
      timeoutMs: config.timeoutMs,
      onEvent: (event) => report.event(event),
    });

    if (result.sessionId) {
      await db.update(projects).set({ claudeSessionId: result.sessionId, updatedAt: new Date() }).where(eq(projects.id, project.id));
    }
    if (!result.ok) {
      await report.status("failed", { claudeSessionId: result.sessionId, resultText: result.resultText });
      return;
    }

    const missing = await missingStepOutputs(config.workspaceDir, job.slug, job.step);
    if (missing.length > 0) {
      const text = `Étape « ${job.step} » sans livrable : ${missing.join(", ")} absent de videos/${job.slug}.`;
      await report.event({ kind: "log", level: "error", text });
      await report.status("failed", { claudeSessionId: result.sessionId, resultText: text });
      return;
    }

    let resultText = result.resultText;
    if (job.step === "build" && project.kind === "template") {
      // The review stays open: asking for a change is how the user gets the contract declared.
      const gap = await templateVariablesGap(config.workspaceDir, job.slug);
      const warning =
        typeof gap === "string"
          ? gap
          : isVariablesDiffEmpty(gap)
            ? null
            : `La composition ne déclare pas les variables validées. Manquantes : ${gap.missing.join(", ") || "aucune"} ; en trop : ${gap.extra.join(", ") || "aucune"} ; type changé : ${gap.changed.join(", ") || "aucun"}.`;
      if (warning) {
        await report.event({ kind: "log", level: "error", text: warning });
        resultText = `${warning}\n\n${resultText ?? ""}`.trim();
      }
    }

    await commitCheckpoint(config.workspaceDir, job.slug, `${job.slug}: ${job.step}${job.feedback ? " (retour)" : ""}`);
    const checkpoint = CHECKPOINT_STEPS.includes(job.step);
    await report.status(checkpoint ? "waiting_review" : "succeeded", {
      claudeSessionId: result.sessionId,
      resultText,
    });

    const next = nextStep(job.step, project.kind);
    if (!checkpoint && next) {
      await db.update(projects).set({ currentStep: next, updatedAt: new Date() }).where(eq(projects.id, project.id));
      await deps.enqueueNext({ projectId: project.id, slug: job.slug, step: next, resumeSessionId: result.sessionId ?? undefined });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await report.event({ kind: "log", level: "error", text: message });
    await report.status("failed", { resultText: message });
    throw error;
  }
}
