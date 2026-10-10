import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  commitCheckpoint,
  compositionVariablesSchema,
  diffVariables,
  parseCompositionVariables,
  type CreationType,
  type GenerationStep,
  type MediaChoice,
  type VariablesDiff,
  workspaceGit,
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

/**
 * Provider settings the workspace CLAUDE.md tells the agent to read from the root `.env`. Never the OpenRouter key:
 * `scripts/audio.mjs` gets a job token of the runner's proxy from `<video>/.studio.env`.
 */
export const WORKSPACE_ENV_KEYS = [
  "TTS_MODEL",
  "TTS_VOICE",
  "TTS_PEAK_DB",
  "MUSIC_MODEL",
] as const;

/** The workspace's `.env`: the agents read it, so the OpenRouter key stays out (they get a proxy token per job). */
export function renderWorkspaceEnv(env: NodeJS.ProcessEnv): string {
  return WORKSPACE_ENV_KEYS
    .filter((key) => env[key] !== undefined)
    .map((key) => `${key}=${env[key]}`)
    .join("\n")
    .concat("\n");
}

/**
 * What `scripts/audio.mjs` reads over the root `.env`: the audio models chosen by the owner of the video, and the
 * proxy token of the job. Rewritten before every step, so a changed setting applies to the next run of the script.
 */
export async function writeStudioEnv(
  workspaceDir: string,
  slug: string,
  media: MediaChoice | undefined,
  openrouter?: { baseUrl: string; token: string },
): Promise<void> {
  const values = {
    TTS_MODEL: media?.ttsModel,
    TTS_VOICE: media?.ttsVoice,
    MUSIC_MODEL: media?.musicModel,
    OPENROUTER_BASE_URL: openrouter?.baseUrl,
    OPENROUTER_API_KEY: openrouter?.token,
  };
  const lines = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`);
  await mkdir(join(workspaceDir, "videos", slug), { recursive: true });
  await writeFile(join(workspaceDir, "videos", slug, ".studio.env"), lines.length ? `${lines.join("\n")}\n` : "");
}

/**
 * The app's copy of CLAUDE.md, scripts and `.claude/settings.json` is synced over the workspace on start: a new
 * version of the app updates the rules, never the videos.
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
  // OpenCode names a project after its root commit: in a repository without one, its sessions fall in a "global"
  // project, where the agent answers "what would you like help with?" instead of doing the step.
  const head = await git(workspaceDir, "rev-parse", "--verify", "-q", "HEAD").catch(() => null);
  if (!head) await git(workspaceDir, "commit", "-q", "--allow-empty", "-m", "workspace");
}

const git = workspaceGit;

export { commitCheckpoint };

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
