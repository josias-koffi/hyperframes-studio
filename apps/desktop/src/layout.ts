import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** Where the app finds what it runs: in its installed resources, or in the repository (`pnpm desktop`). */
export type Layout = {
  /** Optional settings (OpenRouter key, models), read before the services start. */
  envFile: string;
  /** Settings shipped with the installed app (`apps/desktop/defaults.env`), under the person's own; null from the repository. */
  defaultsEnvFile: string | null;
  core: string;
  engine: string;
  /** The front's standalone Next.js server. */
  web: string;
  workspaceSkeleton: string;
  prompts: string;
  opencode: string;
  /** Put first on the PATH of the services and the agents: the app's Node (node, npm, npx) and ffmpeg. */
  binDirs: string[];
  /** `HYPERFRAMES_BIN`, or null to keep the one of `.env`. */
  hyperframes: string[] | null;
  /** `FFMPEG_PATH` and `FFPROBE_PATH`, or null to use the machine's. */
  ffmpeg: { ffmpeg: string; ffprobe: string } | null;
};

/** The installed app: `resources/` as apps/desktop/scripts/stage.mjs lays it out. */
export function packagedLayout(resources: string, userData: string, platform: NodeJS.Platform = process.platform): Layout {
  const runtime = join(resources, "runtime");
  const modules = join(runtime, "node_modules");
  const exe = platform === "win32" ? ".exe" : "";
  // Node's own layout: bin/ on macOS and Linux, the archive's root on Windows.
  const nodeDir = platform === "win32" ? join(resources, "node") : join(resources, "node", "bin");
  const ffmpegDir = join(resources, "ffmpeg");
  return {
    envFile: join(userData, ".env"),
    defaultsEnvFile: join(runtime, "defaults.env"),
    core: join(runtime, "dist", "core.js"),
    engine: join(modules, "@studio", "hf-studio", "dist", "main.js"),
    web: join(resources, "web", "apps", "web", "server.js"),
    workspaceSkeleton: join(resources, "workspace"),
    prompts: join(resources, "prompts"),
    // `opencode-ai` links the platform's binary under this name on every system.
    opencode: join(modules, "opencode-ai", "bin", "opencode.exe"),
    binDirs: [nodeDir, ffmpegDir],
    hyperframes: [join(nodeDir, `node${exe}`), join(modules, "hyperframes", "bin", "hyperframes.mjs")],
    ffmpeg: { ffmpeg: join(ffmpegDir, `ffmpeg${exe}`), ffprobe: join(ffmpegDir, `ffprobe${exe}`) },
  };
}

/** The repository, built (`pnpm desktop`): the machine's Node and ffmpeg, the repository's `.env`. */
export function repoLayout(repo: string, opencodePackage: string): Layout {
  return {
    envFile: join(repo, ".env"),
    defaultsEnvFile: null,
    core: join(repo, "apps", "desktop", "dist", "core.js"),
    engine: join(repo, "apps", "hf-studio", "dist", "main.js"),
    web: join(repo, "apps", "web", ".next", "standalone", "apps", "web", "server.js"),
    workspaceSkeleton: join(repo, "workspace"),
    prompts: join(repo, "prompts"),
    opencode: join(opencodePackage, "bin", "opencode.exe"),
    binDirs: [],
    hyperframes: null,
    ffmpeg: null,
  };
}

/**
 * The PATH of the services and the agents. An app opened from the desktop gets the system's bare PATH (on macOS
 * `/usr/bin:/bin…`): the places where `claude`, `git` and Homebrew's tools usually live are added after it.
 */
export function servicePath(layout: Layout, path: string | undefined, platform: NodeJS.Platform = process.platform, home = homedir()) {
  const usual = platform === "win32" ? [] : [join(home, ".local", "bin"), join(home, ".claude", "local"), "/opt/homebrew/bin", "/usr/local/bin"];
  const dirs = [...layout.binDirs, ...(path ?? "").split(delimiter), ...usual].filter(Boolean);
  return [...new Set(dirs)].join(delimiter);
}
