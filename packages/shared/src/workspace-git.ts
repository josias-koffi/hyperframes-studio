import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Git in the workspace repository, under the studio's own identity. */
export function workspaceGit(cwd: string, ...args: string[]) {
  return exec("git", ["-c", "user.name=Studio", "-c", "user.email=studio@localhost", ...args], { cwd });
}

/**
 * One commit per finished step or editing session: every checkpoint can be compared or rolled back. Nothing is
 * committed when the folder did not change.
 */
export async function commitCheckpoint(workspaceDir: string, slug: string, message: string): Promise<void> {
  await workspaceGit(workspaceDir, "add", "--all", "--", `videos/${slug}`);
  const { stdout } = await workspaceGit(workspaceDir, "status", "--porcelain", "--", `videos/${slug}`);
  if (!stdout.trim()) return;
  await workspaceGit(workspaceDir, "commit", "-q", "-m", message, "--", `videos/${slug}`);
}
