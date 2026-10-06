import { join } from "node:path";
import type { StudioEvent } from "@studio/shared";
import { describe, expect, it } from "vitest";
import { buildClaudeArgs } from "./claude-args";
import { runClaude } from "./run-claude";

const FAKE = join(__dirname, "../test/fake-claude.mjs");

async function run(mode: string, settleMs?: number) {
  const events: StudioEvent[] = [];
  const result = await runClaude({
    bin: process.execPath,
    args: [FAKE, ...buildClaudeArgs({ prompt: "go", resumeSessionId: "prev" })],
    cwd: __dirname,
    env: { ...process.env, FAKE_CLAUDE_MODE: mode },
    timeoutMs: 10_000,
    settleMs,
    onEvent: (event) => {
      events.push(event);
    },
  });
  return { events, result };
}

describe("runClaude", () => {
  it("streams the events in order and reports the session", async () => {
    const { events, result } = await run("ok");
    expect(events.map((e) => e.kind)).toEqual(["session", "text", "tool", "result"]);
    expect(events[1]).toMatchObject({ text: expect.stringContaining("--resume prev") });
    expect(result).toEqual({ ok: true, sessionId: "sess-1", resultText: "Brief écrit", exitCode: 0 });
  });

  it("stops a Claude that stays open after its result and keeps that result", async () => {
    const { events, result } = await run("linger", 200);
    expect(result).toMatchObject({ ok: true, resultText: "Brief écrit" });
    expect(events.at(-1)).toMatchObject({ kind: "log", level: "info" });
  });

  it("fails when Claude reports an error and keeps stderr", async () => {
    const { events, result } = await run("fail");
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(events.at(-1)).toEqual({ kind: "log", level: "error", text: "boom" });
  });
});

describe("buildClaudeArgs", () => {
  it("runs headless, streaming, without permission prompts", () => {
    expect(buildClaudeArgs({ prompt: "p" })).toEqual([
      "-p", "p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", "--strict-mcp-config",
    ]);
    expect(buildClaudeArgs({ prompt: "p", resumeSessionId: "s", model: "m" }).slice(-4)).toEqual(["--resume", "s", "--model", "m"]);
  });

  it("grants the skills directory with --add-dir", () => {
    expect(buildClaudeArgs({ prompt: "p", addDirs: ["/home/node/.claude/skills"] }).slice(-2)).toEqual([
      "--add-dir",
      "/home/node/.claude/skills",
    ]);
  });

  it("passes the workspace permissions through --settings: -p ignores untrusted project allow rules", () => {
    expect(buildClaudeArgs({ prompt: "p", settingsFile: "/ws/.claude/settings.json" }).slice(8, 10)).toEqual([
      "--settings",
      "/ws/.claude/settings.json",
    ]);
  });
});
