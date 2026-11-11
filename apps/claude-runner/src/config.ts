import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { resolveFromRoot, resolveWorkspaceDir } from "@studio/shared";

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
  /** The fal key, used only by the proxy `scripts/shots.mjs` calls (the realistic créations' shots). */
  falApiKey: string | null;
  falQueueUrl: string;
};

export function resolveRunnerConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  return {
    workspaceDir: resolveWorkspaceDir(env),
    skeletonDir: env.WORKSPACE_SKELETON_DIR?.trim() ? resolveFromRoot(env.WORKSPACE_SKELETON_DIR.trim(), env) : null,
    promptsDir: resolveFromRoot(env.PROMPTS_DIR?.trim() || "prompts", env),
    claudeBin: env.CLAUDE_BIN?.trim() || "claude",
    skillsDir: env.CLAUDE_SKILLS_DIR?.trim() || join(homedir(), ".claude", "skills"),
    timeoutMs: Number.parseInt(env.CLAUDE_STEP_TIMEOUT_MS ?? "", 10) || 60 * 60 * 1000,
    opencodeBin: env.OPENCODE_BIN?.trim() || "opencode",
    opencodeIdleMs: Number.parseInt(env.OPENCODE_IDLE_MS ?? "", 10) || 60 * 1000,
    concurrency: Math.max(1, Number.parseInt(env.AGENT_CONCURRENCY ?? "", 10) || 1),
    agentTmpDir: env.AGENT_TMP_DIR?.trim() || join(tmpdir(), "studio-agent"),
    openrouterApiKey: env.OPENROUTER_API_KEY?.trim() || null,
    openrouterBaseUrl: env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
    falApiKey: env.FAL_KEY?.trim() || null,
    falQueueUrl: env.FAL_QUEUE_URL?.trim() || "https://queue.fal.run",
  };
}
