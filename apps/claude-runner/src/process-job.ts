import { join } from "node:path";
import { assets, createJobReporter, creations, projects, type Database, type Publish } from "@studio/db";
import { CHECKPOINT_STEPS, isVariablesDiffEmpty, nextStep, type ClaudeJob } from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, eq, isNull, or } from "drizzle-orm";
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

/**
 * The campaign's assets and the création's own uploads land in `videos/<slug>/assets/uploads/`; the footage
 * or music of another création of the project does not.
 */
async function syncAssets(deps: ProcessDeps, projectId: string, creationId: string, slug: string) {
  const rows = await deps.db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, projectId), or(isNull(assets.creationId), eq(assets.creationId, creationId))));
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

  const [row] = await db
    .select({ creation: creations, project: projects })
    .from(creations)
    .innerJoin(projects, eq(projects.id, creations.projectId))
    .where(eq(creations.id, job.creationId));
  if (!row) throw new Error(`creation ${job.creationId} not found`);
  const { creation, project } = row;
  const setCreation = (values: Partial<typeof creations.$inferInsert>) =>
    db.update(creations).set({ ...values, updatedAt: new Date() }).where(eq(creations.id, creation.id));

  await report.status("running");
  try {
    await ensureVideoFolder(config.workspaceDir, job.slug, creation);
    await syncAssets(deps, project.id, creation.id, job.slug);

    // A silent video has nothing to produce in the media step: no Claude turn, straight to the build.
    if (job.step === "media" && !job.feedback && (await storyboardAudio(config.workspaceDir, job.slug)) === "aucun") {
      await report.event({ kind: "log", level: "info", text: "Storyboard sans voix ni musique (studio_audio: aucun) : étape sautée." });
      await report.status("succeeded", { resultText: "Vidéo muette : aucun média à produire." });
      await setCreation({ currentStep: "build" });
      await deps.enqueueNext({ creationId: creation.id, slug: job.slug, step: "build", resumeSessionId: creation.claudeSessionId ?? undefined });
      return;
    }

    const prompt = await buildPrompt(config.promptsDir, {
      step: job.step,
      type: creation.type,
      kind: creation.kind,
      slug: job.slug,
      workflow: creation.workflow,
      brief: creation.brief,
      width: creation.width,
      height: creation.height,
      durationSeconds: creation.durationSeconds,
      slideCount: creation.slideCount,
      campaign: [project.name, project.context.trim()].filter(Boolean).join("\n\n"),
      feedback: job.feedback,
    });
    const result = await runClaude({
      bin: config.claudeBin,
      args: buildClaudeArgs({
        prompt,
        resumeSessionId: job.resumeSessionId ?? creation.claudeSessionId,
        model: config.stepModels[job.step],
        settingsFile: join(config.workspaceDir, ".claude", "settings.json"),
        addDirs: [config.skillsDir],
      }),
      cwd: config.workspaceDir,
      timeoutMs: config.timeoutMs,
      onEvent: (event) => report.event(event),
    });

    if (result.sessionId) {
      await setCreation({ claudeSessionId: result.sessionId });
    }
    if (!result.ok) {
      await report.status("failed", { claudeSessionId: result.sessionId, resultText: result.resultText });
      return;
    }

    const missing = await missingStepOutputs(config.workspaceDir, job.slug, creation.type, job.step);
    if (missing.length > 0) {
      const text = `Étape « ${job.step} » sans livrable : ${missing.join(", ")} absent de videos/${job.slug}.`;
      await report.event({ kind: "log", level: "error", text });
      await report.status("failed", { claudeSessionId: result.sessionId, resultText: text });
      return;
    }

    let resultText = result.resultText;
    if (job.step === "build" && creation.kind === "template") {
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

    const next = nextStep(job.step, creation);
    if (!checkpoint && next) {
      await setCreation({ currentStep: next });
      await deps.enqueueNext({ creationId: creation.id, slug: job.slug, step: next, resumeSessionId: result.sessionId ?? undefined });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await report.event({ kind: "log", level: "error", text: message });
    await report.status("failed", { resultText: message });
    throw error;
  }
}
