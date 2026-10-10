// Lays out what electron-builder packs, under apps/desktop/build (run after `pnpm build`):
//
//   app/        the Electron main process alone (main.js, layout.js): it needs nothing but Electron and Node
//   runtime/    the core and the engine with their production dependencies (`pnpm deploy`, flat node_modules)
//   web/        the front's standalone Next.js server
//   workspace/  prompts/   the HyperFrames workspace skeleton and the step prompts
//   node/       Node (node, npm, npx) for the agents' commands and the HyperFrames CLI
//   ffmpeg/     ffmpeg and ffprobe
//
// The target is this machine's platform and architecture: an installer is built on the system it is for.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const NODE_VERSION = "24.16.0";

const desktop = join(import.meta.dirname, "..");
const repo = join(desktop, "..", "..");
const build = join(desktop, "build");
const cache = join(desktop, ".cache");
const require = createRequire(join(desktop, "package.json"));
const { platform, arch } = process;
const exe = platform === "win32" ? ".exe" : "";

const step = (text) => console.log(`[stage] ${text}`);
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: "inherit", shell: platform === "win32", ...options });

for (const built of [join(desktop, "dist", "main.js"), join(repo, "apps", "web", ".next", "standalone", "apps", "web", "server.js")]) {
  if (!existsSync(built)) throw new Error(`${built} is missing: run \`pnpm build\` first.`);
}
await rm(build, { recursive: true, force: true });
await mkdir(build, { recursive: true });

step("app: the Electron main process");
const pkg = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
await mkdir(join(build, "app"));
for (const file of ["main.js", "layout.js"]) await cp(join(desktop, "dist", file), join(build, "app", file));
await writeFile(
  join(build, "app", "package.json"),
  JSON.stringify(
    {
      name: "framesmith",
      productName: "Framesmith",
      desktopName: "framesmith.desktop",
      version: pkg.version,
      description: pkg.description,
      author: "Framesmith",
      homepage: "https://github.com/josias-koffi/hyperframes-studio",
      main: "main.js",
    },
    null,
    2,
  ),
);

step("runtime: pnpm deploy of @studio/desktop (core, engine, OpenCode)");
// The deploy records its production-only install as the repository's state: the next `pnpm run` would then purge
// the dev dependencies. The state is put back as it was.
const state = join(repo, "node_modules", ".pnpm-workspace-state-v1.json");
const saved = existsSync(state) ? await readFile(state) : null;
try {
  run("pnpm", ["--filter", "@studio/desktop", "deploy", "--prod", "--legacy", "--config.node-linker=hoisted", join(build, "runtime")], { cwd: repo });
} finally {
  if (saved) await writeFile(state, saved);
}
// Sources and tests of the workspace packages: only their builds run.
for (const name of await readdir(join(build, "runtime", "node_modules", "@studio"))) {
  for (const entry of ["src", "test", "vitest.config.ts", "tsconfig.json"]) {
    await rm(join(build, "runtime", "node_modules", "@studio", name, entry), { recursive: true, force: true });
  }
}
// The platform packages of OpenCode: `opencode-ai` already holds a copy of this platform's binary.
for (const name of await readdir(join(build, "runtime", "node_modules"))) {
  if (name.startsWith("opencode-") && name !== "opencode-ai") await rm(join(build, "runtime", "node_modules", name), { recursive: true, force: true });
}
await rm(join(build, "runtime", "src"), { recursive: true, force: true });
await rm(join(build, "runtime", "scripts"), { recursive: true, force: true });

step("web: the front's standalone server");
// Its node_modules keep pnpm's layout: relative symlinks into node_modules/.pnpm, kept as they are.
await cp(join(repo, "apps", "web", ".next", "standalone"), join(build, "web"), { recursive: true, verbatimSymlinks: true });

step("workspace and prompts");
await cp(join(repo, "workspace"), join(build, "workspace"), {
  recursive: true,
  filter: (source) => !/[\\/](node_modules|\.env|\.git)$/.test(source) && !/[\\/]videos[\\/]/.test(source),
});
await cp(join(repo, "prompts"), join(build, "prompts"), { recursive: true });

step(`node: Node ${NODE_VERSION} for ${platform}-${arch}`);
await stageNode(join(build, "node"));

step("ffmpeg: ffmpeg and ffprobe");
await mkdir(join(build, "ffmpeg"));
await cp(require("ffmpeg-static"), join(build, "ffmpeg", `ffmpeg${exe}`));
await cp(require("ffprobe-static").path, join(build, "ffmpeg", `ffprobe${exe}`));
for (const tool of ["ffmpeg", "ffprobe"]) await chmod(join(build, "ffmpeg", `${tool}${exe}`), 0o755);

step(`done: ${build}`);

/** The official build of Node for this platform, checked against its published SHA-256, cached between runs. */
async function stageNode(target) {
  const os = { darwin: "darwin", linux: "linux", win32: "win" }[platform];
  if (!os) throw new Error(`no Node build for ${platform}`);
  const name = `node-v${NODE_VERSION}-${os}-${arch}`;
  const file = `${name}.${platform === "win32" ? "zip" : "tar.gz"}`;
  const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
  const archive = join(cache, file);
  if (!existsSync(archive)) {
    await mkdir(cache, { recursive: true });
    const response = await fetch(`${base}/${file}`);
    if (!response.ok) throw new Error(`${base}/${file}: ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const expected = sums.split("\n").find((line) => line.endsWith(`  ${file}`))?.split(" ")[0];
  const actual = createHash("sha256").update(await readFile(archive)).digest("hex");
  if (!expected || expected !== actual) {
    await rm(archive, { force: true });
    throw new Error(`${file}: SHA-256 ${actual} does not match the published ${expected}`);
  }
  const unpacked = join(cache, name);
  await rm(unpacked, { recursive: true, force: true });
  run("tar", ["-xf", archive, "-C", cache]);
  // Headers and manuals: nothing the app runs.
  for (const entry of ["include", "share", "CHANGELOG.md", "README.md"]) await rm(join(unpacked, entry), { recursive: true, force: true });
  await cp(unpacked, target, { recursive: true, verbatimSymlinks: true });
  if (platform === "win32") return;
  // bin/npm and bin/npx are symlinks into lib/: scripts instead, which survive any copy of the installer.
  for (const [tool, cli] of [["npm", "npm-cli.js"], ["npx", "npx-cli.js"]]) {
    await rm(join(target, "bin", tool), { force: true });
    const script = `#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/../lib/node_modules/npm/bin/${cli}" "$@"\n`;
    await writeFile(join(target, "bin", tool), script, { mode: 0o755 });
  }
  await rm(join(target, "bin", "corepack"), { force: true });
}
