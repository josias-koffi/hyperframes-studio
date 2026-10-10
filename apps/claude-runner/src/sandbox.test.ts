import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readlink, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentEnv, agentIdentity, folderAcl, grantFolder, lockWorkspace, prepareAgentHome, type Sandbox } from "./sandbox";

const hasAcl = (() => {
  try {
    execFileSync("setfacl", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

function sandbox(mode: Sandbox["mode"], agentsDir = "/agents"): Sandbox {
  return { mode, agentExec: "/usr/local/bin/agent-exec", agentsDir, skillsDir: "/skills", browserDir: "/browser", serviceUid: process.getuid?.() ?? 1000 };
}

describe("agentEnv", () => {
  it("passes no secret of the runner, only the agent's own values", () => {
    const env = agentEnv(
      { home: "/agents/100001", tmp: "/agents/100001/tmp" },
      { OPENROUTER_API_KEY: "sk-studio-x" },
      { PATH: "/usr/bin", DB_PASSWORD: "db", MINIO_ROOT_PASSWORD: "m", OPENROUTER_API_KEY: "sk-or-real", CLAUDE_CODE_OAUTH_TOKEN: "c", TTS_PEAK_DB: "-1" },
    );
    expect(env).toEqual({
      PATH: "/usr/bin",
      TTS_PEAK_DB: "-1",
      HOME: "/agents/100001",
      TMPDIR: "/agents/100001/tmp",
      OPENROUTER_API_KEY: "sk-studio-x",
    });
  });
});

describe("agentIdentity", () => {
  it("gives each uid its own home in uid mode, and keeps the user's home locally", () => {
    expect(agentIdentity(sandbox("uid"), 100002, "/home/me")).toEqual({ uid: 100002, home: "/agents/100002", tmp: "/agents/100002/tmp" });
    expect(agentIdentity(sandbox("off"), 100002, "/home/me")).toEqual({ uid: 100002, home: "/home/me", tmp: "/agents/100002/tmp" });
  });
});

describe("folderAcl", () => {
  it("opens the folder to the runner and the owner's agent only", () => {
    expect(folderAcl(1000, 100005)).toEqual({
      access: "u::rwX,u:1000:rwX,u:100005:rwX,g::---,o::---,m::rwX",
      defaults: "d:u::rwx,d:u:1000:rwx,d:u:100005:rwx,d:g::---,d:o::---,d:m::rwx",
    });
  });
});

describe.skipIf(!hasAcl)("grantFolder and lockWorkspace", () => {
  const acl = (path: string) => execFileSync("getfacl", ["-cp", path], { encoding: "utf8" });

  it("grants a video to its owner, files created later included, and closes the unknown ones", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ws-"));
    await mkdir(join(workspace, "videos", "mine", "assets"), { recursive: true });
    await mkdir(join(workspace, "videos", "orphan"), { recursive: true });
    await writeFile(join(workspace, "videos", "mine", "index.html"), "<html>");
    await writeFile(join(workspace, ".env"), "OPENROUTER_API_KEY=x");

    await lockWorkspace(sandbox("uid"), workspace, (slug) => (slug === "mine" ? 100007 : undefined));

    expect(acl(join(workspace, "videos", "mine", "index.html"))).toContain("user:100007:rw-");
    expect(acl(join(workspace, "videos", "mine", "index.html"))).toContain("other::---");
    await writeFile(join(workspace, "videos", "mine", "assets", "later.png"), "x");
    expect(acl(join(workspace, "videos", "mine", "assets", "later.png"))).toMatch(/user:100007:rwx?\s+#effective:rw-/);
    expect((await stat(join(workspace, "videos", "orphan"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(workspace, "videos"))).mode & 0o777).toBe(0o711);
    expect((await stat(join(workspace, ".env"))).mode & 0o777).toBe(0o600);
  });

  it("does nothing without sandbox", async () => {
    const dir = await mkdtemp(join(tmpdir(), "video-"));
    await grantFolder(sandbox("off"), dir, 100007);
    expect(acl(dir)).not.toContain("100007");
  });

  it("prepares an agent home linked to the shared skills and browser", async () => {
    const agents = await mkdtemp(join(tmpdir(), "agents-"));
    const identity = agentIdentity(sandbox("uid", agents), 100008, "/home/me");
    await prepareAgentHome(sandbox("uid", agents), identity);
    expect(await readlink(join(identity.home, ".claude", "skills"))).toBe("/skills");
    expect(await readlink(join(identity.home, ".cache", "hyperframes", "chrome"))).toBe("/browser");
    expect(acl(identity.tmp)).toContain("user:100008:rwx");
  });
});
