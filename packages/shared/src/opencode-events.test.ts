import { describe, expect, it } from "vitest";
import { createOpencodeTranslator } from "./opencode-events";

const part = (value: Record<string, unknown>) => ({ type: "message.part.updated", properties: { sessionID: "s1", part: { sessionID: "s1", ...value } } });

describe("createOpencodeTranslator", () => {
  it("reports a text part once, when it is finished", () => {
    const t = createOpencodeTranslator("s1");
    expect(t.translate(part({ id: "p1", type: "text", text: "Je lis", time: { start: 1 } })).events).toEqual([]);
    const done = part({ id: "p1", type: "text", text: "Je lis le brief.", time: { start: 1, end: 2 } });
    expect(t.translate(done).events).toEqual([{ kind: "text", text: "Je lis le brief." }]);
    expect(t.translate(done).events).toEqual([]);
    expect(t.lastText()).toBe("Je lis le brief.");
  });

  it("reports a tool call once it ends, together with its result", () => {
    const t = createOpencodeTranslator("s1");
    const tool = (state: Record<string, unknown>) => part({ id: "p2", type: "tool", tool: "bash", state });
    expect(t.translate(tool({ status: "pending", input: {} })).events).toEqual([]);
    expect(t.translate(tool({ status: "running", input: { command: "npm run check -- videos/x" } })).events).toEqual([]);
    const done = tool({ status: "completed", input: { command: "npm run check -- videos/x" }, output: "0 errors" });
    expect(t.translate(done).events).toEqual([
      { kind: "tool", name: "bash", summary: "npm run check -- videos/x" },
      { kind: "tool_result", isError: false, summary: "0 errors" },
    ]);
    expect(t.translate(done).events).toEqual([]);
  });

  it("reports a tool that fails straight away with its call and its error", () => {
    const t = createOpencodeTranslator("s1");
    const events = t.translate(part({ id: "p3", type: "tool", tool: "read", state: { status: "error", input: { filePath: "BRIEF.md" }, error: "not found" } })).events;
    expect(events).toEqual([
      { kind: "tool", name: "read", summary: "BRIEF.md" },
      { kind: "tool_result", isError: true, summary: "not found" },
    ]);
  });

  it("adds up the cost and tokens of every finished step", () => {
    const t = createOpencodeTranslator("s1");
    const step = (id: string, cost: number) =>
      part({ id, type: "step-finish", cost, tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 50, write: 10 } } });
    t.translate(step("f1", 0.01));
    t.translate(step("f1", 0.01));
    t.translate(step("f2", 0.02));
    expect(t.totals()).toEqual({
      costUsd: 0.03,
      usage: { inputTokens: 200, outputTokens: 50, cacheReadTokens: 100, cacheCreationTokens: 20 },
    });
  });

  it("ignores the events of other sessions", () => {
    const t = createOpencodeTranslator("s1");
    expect(t.translate({ type: "session.idle", properties: { sessionID: "s2" } })).toEqual({ events: [] });
  });

  it("ends the turn on idle, failed when the assistant message carried an error", () => {
    const ok = createOpencodeTranslator("s1");
    expect(ok.translate({ type: "session.idle", properties: { sessionID: "s1" } }).end).toEqual({ ok: true });

    const failed = createOpencodeTranslator("s1");
    failed.translate({
      type: "message.updated",
      properties: { sessionID: "s1", info: { sessionID: "s1", role: "assistant", error: { name: "ApiError", data: { message: "credit exhausted" } } } },
    });
    expect(failed.translate({ type: "session.status", properties: { sessionID: "s1", status: { type: "idle" } } }).end).toEqual({
      ok: false,
      error: "credit exhausted",
    });
  });

  it("ends the turn on a session error, even one the server raised without a session id", () => {
    const t = createOpencodeTranslator("s1");
    expect(t.translate({ type: "session.error", properties: { error: { name: "ProviderAuthError", data: { message: "bad key" } } } })).toEqual({
      events: [{ kind: "log", level: "error", text: "bad key" }],
      end: { ok: false, error: "bad key" },
    });
  });
});
