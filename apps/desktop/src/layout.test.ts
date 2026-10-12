import { describe, expect, it } from "vitest";
import { packagedLayout, repoLayout, servicePath } from "./layout";

describe("packagedLayout", () => {
  it("finds the services, Node and ffmpeg in the app's resources", () => {
    const layout = packagedLayout("/opt/Framesmith/resources", "/home/a/.config/Framesmith", "linux");
    expect(layout).toMatchObject({
      envFile: "/home/a/.config/Framesmith/.env",
      defaultsEnvFile: "/opt/Framesmith/resources/runtime/defaults.env",
      core: "/opt/Framesmith/resources/runtime/dist/core.js",
      web: "/opt/Framesmith/resources/web/apps/web/server.js",
      binDirs: ["/opt/Framesmith/resources/node/bin", "/opt/Framesmith/resources/ffmpeg"],
      hyperframes: ["/opt/Framesmith/resources/node/bin/node", "/opt/Framesmith/resources/runtime/node_modules/hyperframes/bin/hyperframes.mjs"],
      ffmpeg: { ffmpeg: "/opt/Framesmith/resources/ffmpeg/ffmpeg", ffprobe: "/opt/Framesmith/resources/ffmpeg/ffprobe" },
    });
  });

  it("uses Node's Windows layout and .exe names on Windows", () => {
    const layout = packagedLayout("C:/Framesmith/resources", "C:/Users/a/AppData/Roaming/Framesmith", "win32");
    expect(layout.hyperframes?.[0]).toMatch(/resources[\\/]node[\\/]node\.exe$/);
    expect(layout.ffmpeg?.ffprobe).toMatch(/ffprobe\.exe$/);
  });
});

describe("repoLayout", () => {
  it("keeps the machine's tools and the repository's .env", () => {
    const layout = repoLayout("/repo", "/repo/node_modules/opencode-ai");
    expect(layout).toMatchObject({ envFile: "/repo/.env", defaultsEnvFile: null, binDirs: [], hyperframes: null, ffmpeg: null });
    expect(layout.web).toBe("/repo/apps/web/.next/standalone/apps/web/server.js");
  });
});

describe("servicePath", () => {
  it("puts the app's tools first and the usual places of claude and git last, once each", () => {
    const layout = packagedLayout("/app/resources", "/data", "darwin");
    expect(servicePath(layout, "/usr/bin:/bin:/usr/local/bin", "darwin", "/Users/a").split(":")).toEqual([
      "/app/resources/node/bin",
      "/app/resources/ffmpeg",
      "/usr/bin",
      "/bin",
      "/usr/local/bin",
      "/Users/a/.local/bin",
      "/Users/a/.claude/local",
      "/opt/homebrew/bin",
    ]);
  });
});
