import { describe, expect, it } from "vitest";
import { parseClaudeStreamLine } from "./claude-events";

describe("parseClaudeStreamLine", () => {
  it("reads the session id from the init line", () => {
    const line = JSON.stringify({ type: "system", subtype: "init", session_id: "abc", model: "claude-opus-5-5" });
    expect(parseClaudeStreamLine(line)).toEqual([{ kind: "session", sessionId: "abc", model: "claude-opus-5-5" }]);
  });

  it("splits an assistant message into text and tool events", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Je lis le brief." },
          { type: "tool_use", name: "Read", input: { file_path: "BRIEF.md" } },
          { type: "tool_use", name: "Bash", input: { command: "npm run check -- videos/x" } },
        ],
      },
    });
    expect(parseClaudeStreamLine(line)).toEqual([
      { kind: "text", text: "Je lis le brief." },
      { kind: "tool", name: "Read", summary: "BRIEF.md" },
      { kind: "tool", name: "Bash", summary: "npm run check -- videos/x" },
    ]);
  });

  it("reports tool results and their errors", () => {
    const line = JSON.stringify({
      type: "user",
      message: { content: [{ type: "tool_result", is_error: true, content: [{ type: "text", text: "boom" }] }] },
    });
    expect(parseClaudeStreamLine(line)).toEqual([{ kind: "tool_result", isError: true, summary: "boom" }]);
  });

  it("maps the final result", () => {
    const line = JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "abc", result: "Fini", num_turns: 4, duration_ms: 1200 });
    expect(parseClaudeStreamLine(line)).toEqual([
      { kind: "result", ok: true, sessionId: "abc", text: "Fini", numTurns: 4, durationMs: 1200 },
    ]);
  });

  it("keeps the cost and token usage of the final result", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      total_cost_usd: 0.42,
      usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 40 },
    });
    expect(parseClaudeStreamLine(line)).toEqual([
      {
        kind: "result",
        ok: true,
        costUsd: 0.42,
        usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 300, cacheCreationTokens: 40 },
      },
    ]);
  });

  it("keeps non-JSON output as a log line and ignores blank lines", () => {
    expect(parseClaudeStreamLine("  ")).toEqual([]);
    expect(parseClaudeStreamLine("warning: something")).toEqual([{ kind: "log", level: "info", text: "warning: something" }]);
  });
});
