import { join } from "node:path";
import { assets, createJobReporter, creations, projects, users, type Database, type Publish } from "@studio/db";
import { CHECKPOINT_STEPS, isVariablesDiffEmpty, modelSlotFor, nextStep, type AgentBackend, type AgentChoice, type ClaudeJob } from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, eq, isNull, or } from "drizzle-orm";
import type { AgentRunner } from "./agents/types";
import type { RunnerConfig } from "./config";
import type { OpenrouterProxy } from "./openrouter-proxy";
import { buildPrompt } from "./prompt";
import { LEGACY_AGENT_UID } from "./sandbox";
import { commitCheckpoint, ensureVideoFolder, missingStepOutputs, storyboardAudio, templateVariablesGap, writeStudioEnv } from "./workspace";

export type ProcessDeps = {
  config: RunnerConfig;
  db: Database;
  storage: Pick<Storage, "downloadToFile">;
  publish: Publish;
  /** Queues the next step when a step without checkpoint succeeds. */
  enqueueNext: (job: Omit<ClaudeJob, "jobId">) => Promise<void>;
  /** The runner of a backend, or null when this environment does not offer it. */
  runnerFor: (backend: AgentBackend) => AgentRunner | null;
  /** Gives `videos/<slug>` to the owner's agent uid, and to no other client (no-op without sandbox). */
  grantVideo: (slug: string, uid: number) => Promise<void>;
  /** Hands out the OpenRouter tokens of `scripts/audio.mjs`; null when no key is configured. */
  proxy: Pick<OpenrouterProxy, "grant"> | null;
};

/** Jobs enqueued before backends were chosen per user ran on Claude Code with the runner's step models. */
export function agentFor(job: ClaudeJob, config: RunnerConfig): AgentChoice {
  const model = job.ai?.models[modelSlotFor(job)];
  return job.ai && model ? { backend: job.ai.backend, model } : { backend: "claude-code", model: config.stepModels[job.step] };
}

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
    .select({ creation: creations, project: projects, agentUid: users.agentUid })
    .from(creations)
    .innerJoin(projects, eq(projects.id, creations.projectId))
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(eq(creations.id, job.creationId));
  if (!row) throw new Error(`creation ${job.creationId} not found`);
  const { creation, project } = row;
  const agentUid = row.agentUid ?? LEGACY_AGENT_UID;
  const setCreation = (values: Partial<typeof creations.$inferInsert>) =>
    db.update(creations).set({ ...values, updatedAt: new Date() }).where(eq(creations.id, creation.id));

  await report.status("running");
  // The job's media calls (voice, music) go through the proxy with this token, which also adds up their cost.
  const media = deps.proxy?.grant({ track: true }) ?? null;
  try {
    await ensureVideoFolder(config.workspaceDir, job.slug, creation);
    await syncAssets(deps, project.id, creation.id, job.slug);
    await writeStudioEnv(config.workspaceDir, job.slug, job.ai?.media, media ?? undefined);
    await deps.grantVideo(job.slug, agentUid);

    // A silent video has nothing to produce in the media step: no Claude turn, straight to the build.
    if (job.step === "media" && !job.feedback && (await storyboardAudio(config.workspaceDir, job.slug)) === "aucun") {
      await report.event({ kind: "log", level: "info", text: "Storyboard sans voix ni musique (studio_audio: aucun) : étape sautée." });
      await report.status("succeeded", { resultText: "Vidéo muette : aucun média à produire." });
      await setCreation({ currentStep: "build" });
      await deps.enqueueNext({ creationId: creation.id, slug: job.slug, step: "build", resumeSessionId: creation.claudeSessionId ?? undefined, ai: job.ai });
      return;
    }

    if (job.mode === "edit") await commitCheckpoint(config.workspaceDir, job.slug, `${job.slug}: édition manuelle`);
    const agent = agentFor(job, config);

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
    const runner = deps.runnerFor(agent.backend);
    if (!runner) {
      const text = `Le backend « ${agent.backend} » n'est pas disponible dans cet environnement.`;
      await report.event({ kind: "log", level: "error", text });
      await report.status("failed", { resultText: text, backend: agent.backend, model: agent.model });
      return;
    }
    // A session is only resumed by the backend that opened it; the prompts re-read the files on disk anyway.
    const sameBackend = (creation.sessionBackend ?? "claude-code") === agent.backend;
    const result = await runner.run({
      prompt,
      sessionId: sameBackend ? (job.resumeSessionId ?? creation.claudeSessionId) : null,
      model: agent.model,
      cwd: config.workspaceDir,
      agentUid,
      timeoutMs: config.timeoutMs,
      onEvent: (event) => report.event(event),
    });
    const mediaCost = (await media?.costUsd()) ?? 0;
    if (mediaCost > 0) await report.event({ kind: "log", level: "info", text: `Coût des médias (voix, musique) : ${mediaCost.toFixed(4)} $` });
    const usage = {
      backend: agent.backend,
      model: agent.model,
      costUsd: result.costUsd === undefined && mediaCost === 0 ? null : (result.costUsd ?? 0) + mediaCost,
      inputTokens: result.usage ? result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheCreationTokens : null,
      outputTokens: result.usage?.outputTokens ?? null,
    };

    if (result.sessionId) {
      await setCreation({ claudeSessionId: result.sessionId, sessionBackend: agent.backend });
    }
    if (!result.ok) {
      await report.status("failed", { ...usage, claudeSessionId: result.sessionId, resultText: result.resultText });
      return;
    }

    const missing = await missingStepOutputs(config.workspaceDir, job.slug, creation.type, job.step);
    if (missing.length > 0) {
      const text = `Étape « ${job.step} » sans livrable : ${missing.join(", ")} absent de videos/${job.slug}.`;
      await report.event({ kind: "log", level: "error", text });
      await report.status("failed", { ...usage, claudeSessionId: result.sessionId, resultText: text });
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

    if (job.mode === "edit") {
      await commitCheckpoint(config.workspaceDir, job.slug, `${job.slug}: édition Claude`);
      await report.status("succeeded", { ...usage, claudeSessionId: result.sessionId, resultText });
      return;
    }

    await commitCheckpoint(config.workspaceDir, job.slug, `${job.slug}: ${job.step}${job.feedback ? " (retour)" : ""}`);
    const checkpoint = CHECKPOINT_STEPS.includes(job.step);
    await report.status(checkpoint ? "waiting_review" : "succeeded", {
      ...usage,
      claudeSessionId: result.sessionId,
      resultText,
    });

    const next = nextStep(job.step, creation);
    if (!checkpoint && next) {
      await setCreation({ currentStep: next });
      await deps.enqueueNext({ creationId: creation.id, slug: job.slug, step: next, resumeSessionId: result.sessionId ?? undefined, ai: job.ai });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await report.event({ kind: "log", level: "error", text: message });
    await report.status("failed", { resultText: message });
    throw error;
  } finally {
    media?.revoke();
  }
}
