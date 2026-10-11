import { homedir, tmpdir } from "node:os";
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
  /** HyperFrames workspace (CLAUDE.md, scripts, videos/<slug>). The agents run from here. */
  workspaceDir: string;
  /** The workspace skeleton shipped with the app, synced over the workspace on start. */
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
  /** Hard limit for one Claude step. */
  timeoutMs: number;
  opencodeBin: string;
  /**
   * `opencode serve` stops after this long without a turn: it holds 0.6 to 1.3 GB and restarts in about a second,
   * its sessions staying on disk.
   */
  opencodeIdleMs: number;
  /** Jobs run at the same time. Claude Code turns stay one at a time whatever this says. */
  concurrency: number;
  /** The agents' own temporary folder. */
  agentTmpDir: string;
  /** The OpenRouter key, used only by the proxy the agents call: they never see it. */
  openrouterApiKey: string | null;
  openrouterBaseUrl: string;
  /**
   * OpenRouter model of the blocks engine's structured calls when the job's owner runs Claude Code, whose models
   * OpenRouter does not know by alias. An OpenCode job uses its own step model.
   */
  blocksModel: string | null;
  /** OpenRouter model the blocks engine falls back to after two failures, for an owner on Claude Code. */
  escalationModel: string | null;
  /** OpenRouter model with vision for the visual check of a build, for an owner on Claude Code. */
  visualModel: string | null;
};

export function resolveRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  return {
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
    timeoutMs: Number.parseInt(env.CLAUDE_STEP_TIMEOUT_MS ?? "", 10) || 60 * 60 * 1000,
    opencodeBin: env.OPENCODE_BIN?.trim() || "opencode",
    opencodeIdleMs: Number.parseInt(env.OPENCODE_IDLE_MS ?? "", 10) || 60 * 1000,
    concurrency: Math.max(1, Number.parseInt(env.AGENT_CONCURRENCY ?? "", 10) || 1),
    agentTmpDir: env.AGENT_TMP_DIR?.trim() || join(tmpdir(), "studio-agent"),
    openrouterApiKey: env.OPENROUTER_API_KEY?.trim() || null,
    openrouterBaseUrl: env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
    blocksModel: env.BLOCKS_MODEL?.trim() || null,
    escalationModel: env.ESCALATION_MODEL?.trim() || null,
    visualModel: env.VISUAL_MODEL?.trim() || null,
  };
}
