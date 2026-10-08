import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  compositionVariablesSchema,
  diffVariables,
  parseCompositionVariables,
  type CreationType,
  type GenerationStep,
  type VariablesDiff,
} from "@studio/shared";

const exec = promisify(execFile);

/** Files of the skeleton never copied over the mounted workspace: they hold runtime data. */
const RUNTIME_ENTRIES = new Set(["videos", ".git", "node_modules", ".env"]);

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Provider settings the workspace CLAUDE.md tells Claude to read from the root `.env`. */
export const WORKSPACE_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "TTS_MODEL",
  "TTS_VOICE",
  "TTS_PEAK_DB",
  "MUSIC_MODEL",
] as const;

export function renderWorkspaceEnv(env: NodeJS.ProcessEnv): string {
  return WORKSPACE_ENV_KEYS.filter((key) => env[key] !== undefined)
    .map((key) => `${key}=${env[key]}`)
    .join("\n")
    .concat("\n");
}

/**
 * The workspace is a volume, so the image's copy of CLAUDE.md, scripts and
 * `.claude/settings.json` is synced over it on start: a new image version
 * updates the rules, never the videos.
 */
export async function syncWorkspaceSkeleton(skeletonDir: string, workspaceDir: string): Promise<void> {
  await mkdir(join(workspaceDir, "videos"), { recursive: true });
  for (const entry of await readdir(skeletonDir)) {
    if (RUNTIME_ENTRIES.has(entry)) continue;
    await cp(join(skeletonDir, entry), join(workspaceDir, entry), { recursive: true, force: true });
  }
  await writeFile(join(workspaceDir, ".env"), renderWorkspaceEnv(process.env), { mode: 0o600 });
  if (!(await exists(join(workspaceDir, ".git")))) {
    await git(workspaceDir, "init", "-q", "-b", "main");
  }
}

function git(cwd: string, ...args: string[]) {
  return exec("git", ["-c", "user.name=Studio", "-c", "user.email=studio@localhost", ...args], { cwd });
}

/**
 * Creates `videos/<slug>` with the workspace's own scaffolding script (`hyperframes init`), sized to the
 * création's canvas when it has one. Returns whether the folder was created.
 */
export async function ensureVideoFolder(
  workspaceDir: string,
  slug: string,
  canvas: { width: number | null; height: number | null } = { width: null, height: null },
): Promise<boolean> {
  const index = join(workspaceDir, "videos", slug, "index.html");
  if (await exists(index)) return false;
  await exec("sh", ["scripts/new-video.sh", slug], { cwd: workspaceDir, timeout: 5 * 60 * 1000 });
  if (canvas.width && canvas.height) await writeFile(index, setCanvasSize(await readFile(index, "utf8"), canvas.width, canvas.height));
  return true;
}

/**
 * Resizes a scaffolded composition, like `hyperframes init --resolution` does for its presets (which have no
 * 4:5): the root's `data-width`/`data-height`, the `html, body` size and the viewport meta.
 */
export function setCanvasSize(html: string, width: number, height: number): string {
  return html
    .replace(/(data-width=)["']\d+["']/g, `$1"${width}"`)
    .replace(/(data-height=)["']\d+["']/g, `$1"${height}"`)
    .replace(/(html\s*,\s*body\s*\{[^}]*?width:\s*)\d+px([^}]*?height:\s*)\d+px/i, `$1${width}px$2${height}px`)
    .replace(/(html\s*,\s*body\s*\{[^}]*?height:\s*)\d+px([^}]*?width:\s*)\d+px/i, `$1${height}px$2${width}px`)
    .replace(/(<meta[^>]*name=["']viewport["'][^>]*content=["']width=)\d+(,\s*height=)\d+/i, `$1${width}$2${height}`)
    .replace(/\s+data-resolution=["'][^"']*["']/, "");
}

/** One commit per finished step: every checkpoint can be compared or rolled back. */
export async function commitCheckpoint(workspaceDir: string, slug: string, message: string): Promise<void> {
  await git(workspaceDir, "add", "--all", "--", `videos/${slug}`);
  const { stdout } = await git(workspaceDir, "status", "--porcelain", "--", `videos/${slug}`);
  if (!stdout.trim()) return;
  await git(workspaceDir, "commit", "-q", "-m", message);
}

/** Files a step must leave in `videos/<slug>`: Claude can report success after a refused write. */
export function stepOutputs(type: CreationType, step: GenerationStep): readonly string[] {
  switch (step) {
    case "brief":
      return ["BRIEF.md"];
    case "footage":
      return ["FOOTAGE.md", "footage_map.json"];
    case "variables":
      return ["VARIABLES.json"];
    case "storyboard":
      // A carousel has no voice over, so no script.
      return type === "video" ? ["SCRIPT.md", "STORYBOARD.md", "storyboard.html"] : ["STORYBOARD.md", "storyboard.html"];
    default:
      return [];
  }
}

export async function missingStepOutputs(workspaceDir: string, slug: string, type: CreationType, step: GenerationStep): Promise<string[]> {
  const missing: string[] = [];
  for (const file of stepOutputs(type, step)) {
    if (!(await exists(join(workspaceDir, "videos", slug, file)))) missing.push(file);
  }
  return missing;
}

/**
 * What the validated storyboard says about sound (`studio_audio:` in the STORYBOARD.md frontmatter, asked for by
 * prompts/storyboard.md). `null` when it does not say: the media step then runs as usual.
 */
export async function storyboardAudio(workspaceDir: string, slug: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(join(workspaceDir, "videos", slug, "STORYBOARD.md"), "utf8");
  } catch {
    return null;
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const value = /^studio_audio:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(frontmatter)?.[1];
  return value?.trim().toLowerCase() ?? null;
}

/**
 * After a template's build: does `index.html` declare the validated contract (`VARIABLES.json`)? Returns the
 * gap, or an error message when either side cannot be read.
 */
export async function templateVariablesGap(workspaceDir: string, slug: string): Promise<VariablesDiff | string> {
  const dir = join(workspaceDir, "videos", slug);
  try {
    const validated = compositionVariablesSchema.parse(JSON.parse(await readFile(join(dir, "VARIABLES.json"), "utf8")));
    const declared = parseCompositionVariables(await readFile(join(dir, "index.html"), "utf8"));
    return diffVariables(validated, declared);
  } catch (error) {
    return `Variables illisibles : ${error instanceof Error ? error.message : String(error)}`;
  }
}
