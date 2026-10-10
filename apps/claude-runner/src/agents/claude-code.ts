import { join } from "node:path";
import type { StudioEvent } from "@studio/shared";
import { buildClaudeArgs } from "../claude-args";
import { runClaude } from "../run-claude";
import type { AgentRunner } from "./types";

export type ClaudeCodeOptions = {
  bin: string;
  /** Installed HyperFrames skills, granted with `--add-dir`. */
  skillsDir: string;
  workspaceDir: string;
  /** The environment of `claude -p`: the runner's own secrets (database, storage, OpenRouter) stay out. */
  env?: Record<string, string>;
};

/**
 * Headless Claude Code (`claude -p`) on the person's own subscription. Its quota is shared by every job, so turns
 * run one at a time even when the worker runs several OpenCode jobs in parallel.
 */
export function createClaudeCodeRunner({ bin, skillsDir, workspaceDir, env }: ClaudeCodeOptions): AgentRunner {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    run({ prompt, sessionId, model, cwd, timeoutMs, onEvent }) {
      const turn = queue.then(async () => {
        let result: (StudioEvent & { kind: "result" }) | undefined;
        const outcome = await runClaude({
          bin,
          args: buildClaudeArgs({
            prompt,
            resumeSessionId: sessionId,
            model,
            settingsFile: join(workspaceDir, ".claude", "settings.json"),
            addDirs: [skillsDir],
          }),
          cwd,
          env,
          timeoutMs,
          onEvent: (event) => {
            if (event.kind === "result") result = event;
            return onEvent(event);
          },
        });
        return { ...outcome, costUsd: result?.costUsd, usage: result?.usage };
      });
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
}
