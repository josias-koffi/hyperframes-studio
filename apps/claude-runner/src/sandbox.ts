import { execFile, spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdir, readdir, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Each client's agent runs under its own Unix uid (`users.agent_uid`), so that it can read neither another
 * client's videos nor the runner's secrets (`/proc/1/environ`). Swarm refuses the namespaces bubblewrap needs, so
 * the separation is the plain uid + ACL one, switched with `sudo agent-exec` (docker/agent-exec.sh).
 *
 * `off` (local development): the agent runs as the runner's own user, with the same cleaned environment.
 */
export type SandboxMode = "uid" | "off";

/** The uid of projects without an owner (created before accounts). The sequence starts after it. */
export const LEGACY_AGENT_UID = 100000;

export type Sandbox = {
  mode: SandboxMode;
  /** `sudo -n <agentExec> <uid> <cmd…>`: the only command the runner may run as root. */
  agentExec: string;
  /** Home of each client's agent: `<agentsDir>/<uid>` (sessions, npm cache, its own tmp). */
  agentsDir: string;
  /** Installed HyperFrames skills, linked into every agent home. */
  skillsDir: string;
  /** Browser downloaded by `hyperframes browser ensure`, shared read-only by every agent home. */
  browserDir: string | null;
  /** The runner's uid: the api, render-worker and hf-studio share it on the workspace volume. */
  serviceUid: number;
};

export type AgentIdentity = { uid: number; home: string; tmp: string };

/** Variables of the runner an agent may see: nothing that opens the database, the storage or a provider. */
const PASSED_THROUGH = ["PATH", "LANG", "LC_ALL", "TZ", "TTS_PEAK_DB", "HYPERFRAMES_BROWSER_PATH", "HYPERFRAMES_NO_TELEMETRY"] as const;

export function agentEnv(identity: { home: string; tmp: string }, extra: Record<string, string>, env: NodeJS.ProcessEnv = process.env) {
  const passed = Object.fromEntries(PASSED_THROUGH.filter((key) => env[key] !== undefined).map((key) => [key, env[key] as string]));
  return { ...passed, HOME: identity.home, TMPDIR: identity.tmp, ...extra };
}

export function agentIdentity(sandbox: Sandbox, uid: number, home: string): AgentIdentity {
  if (sandbox.mode === "off") return { uid, home, tmp: join(sandbox.agentsDir, String(uid), "tmp") };
  const dir = join(sandbox.agentsDir, String(uid));
  return { uid, home: dir, tmp: join(dir, "tmp") };
}

/** ACL entries giving the runner's uid and one agent uid the folder, and nobody else. */
export function folderAcl(serviceUid: number, uid: number): { access: string; defaults: string } {
  const entries = (prefix: string, x: string) =>
    [`${prefix}u::rw${x}`, `${prefix}u:${serviceUid}:rw${x}`, `${prefix}u:${uid}:rw${x}`, `${prefix}g::---`, `${prefix}o::---`, `${prefix}m::rw${x}`].join(",");
  return { access: entries("", "X"), defaults: entries("d:", "x") };
}

/**
 * Gives a folder (a video, an agent home) to one agent uid: the access ACL on everything in it, the default ACL on
 * its directories so that what the api or the agent creates later inherits it. Run before every turn: files written
 * by hand in the editor, uploads and checkouts land with the runner's rights.
 */
export async function grantFolder(sandbox: Sandbox, dir: string, uid: number): Promise<void> {
  if (sandbox.mode === "off") return;
  const { access, defaults } = folderAcl(sandbox.serviceUid, uid);
  await exec("setfacl", ["-R", "-m", access, dir]);
  await exec("find", [dir, "-type", "d", "-exec", "setfacl", "-m", defaults, "{}", "+"]);
}

/** A folder nobody but the runner's uid reads (a video whose owner is unknown, the git history). */
export async function closeFolder(sandbox: Sandbox, dir: string): Promise<void> {
  if (sandbox.mode === "off") return;
  await exec("setfacl", ["-R", "-b", dir]);
  await chmod(dir, 0o700);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Creates an agent home: its tmp, and links to the skills and the browser, which stay the image's. */
export async function prepareAgentHome(sandbox: Sandbox, identity: AgentIdentity): Promise<void> {
  await mkdir(identity.tmp, { recursive: true });
  if (sandbox.mode === "off") return;
  await mkdir(join(identity.home, ".claude"), { recursive: true });
  await mkdir(join(identity.home, ".cache", "hyperframes"), { recursive: true });
  const links: [string | null, string][] = [
    [sandbox.skillsDir, join(identity.home, ".claude", "skills")],
    [sandbox.browserDir, join(identity.home, ".cache", "hyperframes", "chrome")],
  ];
  for (const [target, path] of links) {
    if (target && !(await exists(path))) await symlink(target, path);
  }
  await grantFolder(sandbox, identity.home, identity.uid);
}

/**
 * Workspace rights in `uid` mode: the skeleton (CLAUDE.md, scripts, node_modules) readable by all, `videos/`
 * crossable but not listable, the runner's own files closed. Each video folder is then granted to its owner.
 */
export async function lockWorkspace(sandbox: Sandbox, workspaceDir: string, ownerOf: (slug: string) => number | undefined): Promise<void> {
  if (sandbox.mode === "off") return;
  await chmod(workspaceDir, 0o755);
  for (const entry of [".git", ".studio-history"]) {
    if (await exists(join(workspaceDir, entry))) await closeFolder(sandbox, join(workspaceDir, entry));
  }
  if (await exists(join(workspaceDir, ".env"))) await chmod(join(workspaceDir, ".env"), 0o600);
  const videos = join(workspaceDir, "videos");
  await mkdir(videos, { recursive: true });
  await chmod(videos, 0o711);
  for (const slug of await readdir(videos)) {
    const uid = ownerOf(slug);
    if (uid === undefined) await closeFolder(sandbox, join(videos, slug));
    else await grantFolder(sandbox, join(videos, slug), uid);
  }
}

/**
 * Starts a process as an agent. In `uid` mode the environment goes through stdin, never the arguments: every
 * uid can read `/proc/<pid>/cmdline`.
 */
export function spawnAgent(
  sandbox: Sandbox,
  identity: AgentIdentity,
  bin: string,
  args: string[],
  { cwd, env }: { cwd: string; env: Record<string, string> },
): ChildProcess {
  if (sandbox.mode === "off") return spawn(bin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const child = spawn("sudo", ["-n", sandbox.agentExec, String(identity.uid), bin, ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin?.end(
    Object.entries(env)
      .map(([key, value]) => `${key}=${value.replace(/\n/g, " ")}\n`)
      .join(""),
  );
  return child;
}

/** Fails at start when `uid` mode cannot switch users, rather than at the first client's job. */
export async function checkSandbox(sandbox: Sandbox): Promise<void> {
  if (sandbox.mode === "off") return;
  await exec("sudo", ["-n", sandbox.agentExec, "--check"]);
}
