import { homedir } from "node:os";
import { join } from "node:path";
import { assets, createJobReporter, creations, projects, type Database, type Publish } from "@studio/db";
import {
  BLOCKS_STEPS,
  CHECKPOINT_STEPS,
  isVariablesDiffEmpty,
  modelSlotFor,
  nextStep,
  SLIDE_COUNT,
  usesBlocks,
  type AgentBackend,
  type AgentChoice,
  type ClaudeJob,
  type StudioEvent,
} from "@studio/shared";
import type { Storage } from "@studio/storage";
import { and, eq, isNull, or } from "drizzle-orm";
import { agentEnv } from "./agent-env";
import type { AgentRunner, AgentTurnResult } from "./agents/types";
import { runBlocksStep, runCommand } from "./blocks";
import { addUsage, type Escalation } from "./structured";
import type { RunnerConfig } from "./config";
import type { OpenrouterProxy } from "./openrouter-proxy";
import { buildPrompt } from "./prompt";
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
  /** Hands out the OpenRouter tokens of `scripts/audio.mjs`; null when no key is configured. */
  proxy: Pick<OpenrouterProxy, "grant"> | null;
};

/** Jobs enqueued before backends were chosen per user ran on Claude Code with the runner's step models. */
export function agentFor(job: ClaudeJob, config: Pick<RunnerConfig, "stepModels">): AgentChoice {
  const model = job.ai?.models[modelSlotFor(job)];
  return job.ai && model ? { backend: job.ai.backend, model } : { backend: "claude-code", model: config.stepModels[job.step] };
}

/**
 * The OpenRouter model of the blocks engine: the step model of an OpenCode job, else `BLOCKS_MODEL` (a Claude Code
 * alias means nothing to OpenRouter).
 */
export function blocksModelFor(job: ClaudeJob, config: Pick<RunnerConfig, "blocksModel">): string | null {
  const model = job.ai?.models[modelSlotFor(job)];
  return job.ai?.backend === "opencode" && model ? model : config.blocksModel;
}

/**
 * The OpenRouter models of the escalation and of the visual check: the owner's slots on OpenCode, else
 * `ESCALATION_MODEL` and `VISUAL_MODEL`. Null: no escalation, no visual check.
 */
export function blocksSlotModels(job: ClaudeJob, config: Pick<RunnerConfig, "escalationModel" | "visualModel">): { escalation: string | null; visual: string | null } {
  if (job.ai?.backend === "opencode") return { escalation: job.ai.models.escalation ?? null, visual: job.ai.models.visual ?? null };
  return { escalation: config.escalationModel, visual: config.visualModel };
}

/**
 * The agent a build falls back to after two failed checks: the owner's escalation slot on OpenCode, else
 * `CLAUDE_MODEL_ESCALATION` (Opus by default) on Claude Code. Null when it is the model that already failed.
 */
export function escalationAgentFor(job: ClaudeJob, config: Pick<RunnerConfig, "escalationAgentModel" | "stepModels">): string | null {
  const own = agentFor(job, config);
  const model = job.ai?.backend === "opencode" ? (job.ai.models.escalation ?? null) : config.escalationAgentModel;
  return model && model !== own.model ? model : null;
}

/** What `npm run check` found wrong in an agent's build, sent back to it. */
export function checkRepairPrompt(dir: string, output: string): string {
  return [
    `Le studio a relancé \`npm run check -- ${dir}\` après ton build : il échoue.`,
    "",
    "```",
    output.trim(),
    "```",
    "",
    `Corrige les compositions de \`${dir}\` jusqu'à ce que \`npm run check -- ${dir}\` passe sans erreur (lance-le au premier plan et attends sa sortie), sans changer ce qui n'est pas en cause, puis reprends la planche de snapshots. Termine par le résultat du check.`,
  ].join("\n");
}

type Turn = (input: { prompt: string; sessionId: string | null; model: string }) => Promise<AgentTurnResult>;

/**
 * The studio runs `check` itself after an agent's build. A failure goes back to the same session; the second one
 * to the escalation model, in the same session; the third fails the step. The turns' costs add up.
 */
export async function verifyBuild({
  job,
  config,
  env,
  report,
  turn,
  first,
  model,
  escalationModel,
}: {
  job: ClaudeJob;
  config: Pick<RunnerConfig, "workspaceDir" | "timeoutMs">;
  /** Environment of `npm run check`. */
  env: Record<string, string>;
  report: { event: (event: StudioEvent) => Promise<void> };
  turn: Turn;
  first: AgentTurnResult;
  model: string;
  escalationModel: string | null;
}): Promise<{ result: AgentTurnResult; escalation?: Escalation }> {
  const dir = `videos/${job.slug}`;
  const ctx = { workspaceDir: config.workspaceDir, env, onEvent: (event: StudioEvent) => report.event(event) };
  let result = first;
  let escalation: Escalation | undefined;
  for (let failures = 0; ; failures++) {
    const check = await runCommand(ctx, "npm", ["run", "check", "--", dir], config.timeoutMs);
    if (check.code === 0) return { result, escalation };
    const output = check.output.length > 4000 ? `…${check.output.slice(-4000)}` : check.output;
    const escalating = failures === 1;
    const next = escalating ? escalationModel : model;
    if (failures >= 2 || !next) {
      return { result: { ...result, ok: false, resultText: `Le check HyperFrames échoue toujours après le build :\n${output}` }, escalation };
    }
    await report.event({
      kind: "log",
      level: "info",
      text: escalating ? `Escalade : deuxième check en échec, ${next} reprend le build.` : "Check en échec après le build : l'agent corrige.",
    });
    const fix = await turn({ prompt: checkRepairPrompt(dir, output), sessionId: result.sessionId, model: next });
    if (escalating) escalation = { model: next, costUsd: fix.costUsd ?? 0 };
    result = {
      ...fix,
      sessionId: fix.sessionId ?? result.sessionId,
      costUsd: result.costUsd === undefined && fix.costUsd === undefined ? undefined : (result.costUsd ?? 0) + (fix.costUsd ?? 0),
      usage: addUsage(result.usage, fix.usage),
    };
    if (!fix.ok) return { result, escalation };
  }
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
  // The job's media calls (voice, music) go through the proxy with this token, which also adds up their cost.
  const media = deps.proxy?.grant({ track: true }) ?? null;
  try {
    await ensureVideoFolder(config.workspaceDir, job.slug, creation);
    await syncAssets(deps, project.id, creation.id, job.slug);
    await writeStudioEnv(config.workspaceDir, job.slug, job.ai?.media, media ?? undefined);

    // A silent video has nothing to produce in the media step: no Claude turn, straight to the build.
    if (job.step === "media" && !job.feedback && (await storyboardAudio(config.workspaceDir, job.slug)) === "aucun") {
      await report.event({ kind: "log", level: "info", text: "Storyboard sans voix ni musique (studio_audio: aucun) : étape sautée." });
      await report.status("succeeded", { resultText: "Vidéo muette : aucun média à produire." });
      await setCreation({ currentStep: "build" });
      await deps.enqueueNext({ creationId: creation.id, slug: job.slug, step: "build", ai: job.ai });
      return;
    }

    if (job.mode === "edit") await commitCheckpoint(config.workspaceDir, job.slug, `${job.slug}: édition manuelle`);
    const campaign = [project.name, project.context.trim()].filter(Boolean).join("\n\n");

    let agent: AgentChoice;
    let result: AgentTurnResult;
    let escalation: Escalation | undefined;
    if (usesBlocks(creation) && BLOCKS_STEPS.includes(job.step) && job.mode !== "edit") {
      // The blocks engine: a structured call and code, no agent turn and no session, but for a custom scene.
      agent = { backend: "opencode", model: blocksModelFor(job, config) ?? "aucun" };
      const slots = blocksSlotModels(job, config);
      const sceneAgent = agentFor(job, config);
      const sceneRunner = deps.runnerFor(sceneAgent.backend);
      const step = await runBlocksStep({
        workspaceDir: config.workspaceDir,
        slug: job.slug,
        step: job.step,
        format: {
          width: creation.width ?? 1080,
          height: creation.height ?? 1920,
          durationSeconds: creation.durationSeconds,
          frames: creation.type === "carousel" ? (creation.slideCount ?? SLIDE_COUNT.default) : creation.type === "image" ? 1 : null,
        },
        campaign,
        creation: { type: creation.type, kind: creation.kind, brief: creation.brief },
        feedback: job.feedback,
        model: blocksModelFor(job, config),
        escalationModel: slots.escalation,
        visualModel: slots.visual,
        openrouter: media ? { baseUrl: media.baseUrl, token: media.token } : null,
        env: agentEnv({ home: homedir(), tmp: config.agentTmpDir }, {}),
        timeoutMs: config.timeoutMs,
        onEvent: (event) => report.event(event),
        customScene: sceneRunner
          ? async (prompt) => {
              const turn = await sceneRunner.run({ prompt, sessionId: null, model: sceneAgent.model, cwd: config.workspaceDir, timeoutMs: config.timeoutMs, onEvent: (event) => report.event(event) });
              return { ok: turn.ok, resultText: turn.resultText, usage: turn.usage, costUsd: turn.costUsd };
            }
          : undefined,
      });
      result = { ok: step.ok, sessionId: null, resultText: step.resultText, usage: step.usage, costUsd: step.costUsd };
      escalation = step.escalation;
      if (!step.ok && step.resultText) await report.event({ kind: "log", level: "error", text: step.resultText });
    } else {
      agent = agentFor(job, config);
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
        campaign,
        feedback: job.feedback,
      });
      const runner = deps.runnerFor(agent.backend);
      if (!runner) {
        const text = `Le backend « ${agent.backend} » n'est pas disponible dans cet environnement.`;
        await report.event({ kind: "log", level: "error", text });
        await report.status("failed", { resultText: text, backend: agent.backend, model: agent.model });
        return;
      }
      // A new session for every step, fed by the validated files on disk: only a comment on the same step (a review
      // comment, an editor change) resumes it, and only on the backend that opened it.
      const sameBackend = (creation.sessionBackend ?? "claude-code") === agent.backend;
      const turn = (input: { prompt: string; sessionId: string | null; model: string }) =>
        runner.run({ ...input, cwd: config.workspaceDir, timeoutMs: config.timeoutMs, onEvent: (event) => report.event(event) });
      result = await turn({ prompt, sessionId: job.feedback && sameBackend ? (job.resumeSessionId ?? creation.claudeSessionId) : null, model: agent.model });
      if (result.ok && job.step === "build") {
        const env = agentEnv({ home: homedir(), tmp: config.agentTmpDir }, {});
        const verified = await verifyBuild({ job, config, env, report, turn, first: result, model: agent.model, escalationModel: escalationAgentFor(job, config) });
        result = verified.result;
        escalation = verified.escalation;
      }
    }
    const mediaCost = (await media?.costUsd()) ?? 0;
    if (mediaCost > 0) await report.event({ kind: "log", level: "info", text: `Coût des appels OpenRouter du job (voix, musique, storyboard du moteur blocs) : ${mediaCost.toFixed(4)} $` });
    const usage = {
      backend: agent.backend,
      model: agent.model,
      costUsd: result.costUsd === undefined && mediaCost === 0 ? null : (result.costUsd ?? 0) + mediaCost,
      inputTokens: result.usage ? result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheCreationTokens : null,
      outputTokens: result.usage?.outputTokens ?? null,
      escalationModel: escalation?.model ?? null,
      escalationCostUsd: escalation?.costUsd ?? null,
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
      await deps.enqueueNext({ creationId: creation.id, slug: job.slug, step: next, ai: job.ai });
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
