import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

/**
 * Loads `.env` from the app folder or the repository root. A variable already
 * set (what a container does) wins over the file. Also records the folder of
 * that file as `STUDIO_ROOT`, the base of the relative paths it contains.
 */
export function loadEnvironmentFiles(cwd: string = process.cwd()): string | null {
  for (const candidate of [resolve(cwd, ".env"), resolve(cwd, "../../.env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      process.env.STUDIO_ROOT ??= dirname(candidate);
      return candidate;
    }
  }
  return null;
}

/**
 * Resolves a path setting (`WORKSPACE_DIR`, `PROMPTS_DIR`…) against the
 * repository root rather than the working directory: `pnpm dev` starts each
 * app from its own folder.
 */
export function resolveFromRoot(path: string, env: NodeJS.ProcessEnv = process.env): string {
  return isAbsolute(path) ? path : resolve(env.STUDIO_ROOT ?? process.cwd(), path);
}

export function resolveWorkspaceDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveFromRoot(env.WORKSPACE_DIR?.trim() || ".workspace", env);
}
