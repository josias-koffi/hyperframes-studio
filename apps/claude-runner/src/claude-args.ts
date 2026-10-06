export type ClaudeInvocation = {
  prompt: string;
  resumeSessionId?: string | null;
  model?: string | null;
  /** The workspace `.claude/settings.json`, passed explicitly (see below). */
  settingsFile?: string | null;
  /** Directories outside the workspace Claude may read (`--add-dir`). */
  addDirs?: string[];
};

/**
 * Arguments of one headless Claude Code turn. `dontAsk` refuses every tool call
 * that the workspace `.claude/settings.json` does not allow: nobody is there to
 * answer a permission prompt. `-p` never shows the workspace trust dialog, and the
 * allow rules of an untrusted project file are ignored, so the file goes through
 * `--settings`, whose rules apply without trust.
 */
export function buildClaudeArgs({ prompt, resumeSessionId, model, settingsFile, addDirs = [] }: ClaudeInvocation): string[] {
  // `--strict-mcp-config` without `--mcp-config`: no MCP server of the host's own Claude config.
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--strict-mcp-config"];
  if (settingsFile) args.push("--settings", settingsFile);
  for (const dir of addDirs) args.push("--add-dir", dir);
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  if (model) args.push("--model", model);
  return args;
}
