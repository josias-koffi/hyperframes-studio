import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { GENERATION_STEPS, resolveFromRoot, resolveWorkspaceDir, type GenerationStep } from "@studio/shared";
import type { SandboxMode } from "./sandbox";

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
  /** The server's Claude Code subscription: off where no admin should use it (`CLAUDE_CODE_ENABLED=false`). */
  claudeCodeEnabled: boolean;
  opencodeBin: string;
  /**
   * A client's `opencode serve` stops after this long without a turn: it holds 0.6 to 1.3 GB and restarts in about
   * a second, its sessions staying on disk in the agent home.
   */
  opencodeIdleMs: number;
  /** Jobs run at the same time. Claude Code turns stay one at a time whatever this says. */
  concurrency: number;
  /** `uid` (image): each client's agent under its own Unix uid. `off` (local): under the runner's user. */
  sandbox: SandboxMode;
  agentExec: string;
  /** Agent homes, `<dir>/<uid>`: OpenCode sessions, npm cache, private tmp. */
  agentsDir: string;
  /** `hyperframes browser ensure`'s download, linked read-only into every agent home. */
  browserDir: string | null;
  /** The platform key, used only by the proxy the agents call. */
  openrouterApiKey: string | null;
  openrouterBaseUrl: string;
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
    claudeCodeEnabled: (env.CLAUDE_CODE_ENABLED ?? "true").trim() !== "false",
    opencodeBin: env.OPENCODE_BIN?.trim() || "opencode",
    opencodeIdleMs: Number.parseInt(env.OPENCODE_IDLE_MS ?? "", 10) || 60 * 1000,
    concurrency: Math.max(1, Number.parseInt(env.AGENT_CONCURRENCY ?? "", 10) || 1),
    sandbox: env.AGENT_SANDBOX?.trim() === "uid" ? "uid" : "off",
    agentExec: env.AGENT_EXEC?.trim() || "/usr/local/bin/agent-exec",
    agentsDir: env.AGENT_HOMES_DIR?.trim() || join(tmpdir(), "studio-agents"),
    browserDir: env.AGENT_BROWSER_DIR?.trim() || null,
    openrouterApiKey: env.OPENROUTER_API_KEY?.trim() || null,
    openrouterBaseUrl: env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
  };
}
