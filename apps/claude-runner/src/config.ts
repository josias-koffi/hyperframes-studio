import { homedir } from "node:os";
import { join } from "node:path";
import { GENERATION_STEPS, resolveFromRoot, resolveWorkspaceDir, type GenerationStep } from "@studio/shared";

/**
 * Steps that follow a recipe (write BRIEF.md and VARIABLES.json, run scripts/audio.mjs) run on Sonnet; the footage
 * analysis, which reads the rush as images, and the storyboard and the build, where the video is designed, run on
 * `CLAUDE_MODEL` (Opus by default). `CLAUDE_MODEL_<STEP>` overrides either. Every step names its model: `--resume`
 * without `--model` keeps the model of the previous step.
 */
const RECIPE_STEP_MODEL = "sonnet";
const DESIGN_STEP_MODEL = "opus";
const RECIPE_STEPS: readonly GenerationStep[] = ["brief", "variables", "media"];

export type RunnerConfig = {
  redisUrl: string;
  /** Mounted HyperFrames workspace (CLAUDE.md, scripts, videos/<slug>). Claude runs from here. */
  workspaceDir: string;
  /** Read-only copy of the workspace skeleton baked into the image, synced on start. */
  skeletonDir: string | null;
  promptsDir: string;
  claudeBin: string;
  /**
   * Installed HyperFrames skills, granted with `--add-dir`: outside the workspace, `ls`/`cat` on their
   * references and scripts are refused in a headless run otherwise.
   */
  skillsDir: string;
  model: string | null;
  /** Model of each step: `CLAUDE_MODEL_<STEP>`, else Sonnet for recipe steps, else `model`, else Opus. */
  stepModels: Record<GenerationStep, string>;
  /** Staging shares the subscription quota with production: jobs are refused there by default. */
  enabled: boolean;
  /** Hard limit for one Claude step. */
  timeoutMs: number;
};

export function resolveRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  return {
    redisUrl: env.REDIS_URL?.trim() || "redis://localhost:6390",
    workspaceDir: resolveWorkspaceDir(env),
    skeletonDir: env.WORKSPACE_SKELETON_DIR?.trim() ? resolveFromRoot(env.WORKSPACE_SKELETON_DIR.trim(), env) : null,
    promptsDir: resolveFromRoot(env.PROMPTS_DIR?.trim() || "prompts", env),
    claudeBin: env.CLAUDE_BIN?.trim() || "claude",
    skillsDir: env.CLAUDE_SKILLS_DIR?.trim() || join(homedir(), ".claude", "skills"),
    model: env.CLAUDE_MODEL?.trim() || null,
    stepModels: Object.fromEntries(
      GENERATION_STEPS.map((step) => [
        step,
        env[`CLAUDE_MODEL_${step.toUpperCase()}`]?.trim() ||
          (RECIPE_STEPS.includes(step) ? RECIPE_STEP_MODEL : env.CLAUDE_MODEL?.trim() || DESIGN_STEP_MODEL),
      ]),
    ) as Record<GenerationStep, string>,
    enabled: (env.CLAUDE_JOBS_ENABLED ?? "true").trim() !== "false",
    timeoutMs: Number.parseInt(env.CLAUDE_STEP_TIMEOUT_MS ?? "", 10) || 60 * 60 * 1000,
  };
}
