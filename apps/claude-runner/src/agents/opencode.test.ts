import type { StudioEvent } from "@studio/shared";
import { describe, expect, it, vi } from "vitest";
import { createOpencodeRunner, parseSse, type OpencodeClient } from "./opencode";

/** A client whose event stream replays `events` once the prompt is sent, then stays open. */
function fakeClient(events: unknown[], { hang = false } = {}) {
  let release: () => void = () => undefined;
  const prompted = new Promise<void>((resolve) => (release = resolve));
  const client: OpencodeClient & { calls: string[] } = {
    calls: [],
    createSession: vi.fn(async () => {
      client.calls.push("create");
      return "ses_new";
    }),
    prompt: vi.fn(async (_dir, sessionId, model) => {
      client.calls.push(`prompt ${sessionId} ${model.providerID}/${model.modelID}`);
      release();
    }),
    abort: vi.fn(async (_dir, sessionId) => {
      client.calls.push(`abort ${sessionId}`);
    }),
    rejectPermission: vi.fn(async (_dir, id) => {
      client.calls.push(`reject ${id}`);
    }),
    events: vi.fn(async (_dir, signal: AbortSignal) =>
      (async function* () {
        await prompted;
        yield* events;
        if (hang) await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
      })(),
    ),
  };
  return client;
}

const part = (sessionID: string, value: Record<string, unknown>) => ({ type: "message.part.updated", properties: { sessionID, part: { sessionID, ...value } } });

describe("createOpencodeRunner", () => {
  it("opens a session, prompts it on OpenRouter and reports the turn with its cost", async () => {
    const client = fakeClient([
      part("ses_new", { id: "t1", type: "tool", tool: "bash", state: { status: "completed", input: { command: "ls" }, output: "BRIEF.md" } }),
      part("ses_new", { id: "x1", type: "text", text: "Brief écrit.", time: { start: 1, end: 2 } }),
      part("ses_new", { id: "f1", type: "step-finish", cost: 0.5, tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } } }),
      { type: "session.idle", properties: { sessionID: "ses_new" } },
    ]);
    const events: StudioEvent[] = [];
    const result = await createOpencodeRunner(client).run({
      prompt: "Écris le brief",
      sessionId: null,
      model: "openai/gpt-5",
      cwd: "/ws",
      agentUid: 100001,
      timeoutMs: 5_000,
      onEvent: (event) => void events.push(event),
    });

    expect(client.calls).toEqual(["create", "prompt ses_new openrouter/openai/gpt-5"]);
    expect(result).toMatchObject({ ok: true, sessionId: "ses_new", resultText: "Brief écrit.", costUsd: 0.5 });
    expect(events.map((event) => event.kind)).toEqual(["session", "tool", "tool_result", "text", "result"]);
    expect(events.at(-1)).toMatchObject({ kind: "result", ok: true, costUsd: 0.5, usage: { inputTokens: 10, outputTokens: 5 } });
  });

  it("resumes the given session and refuses a permission prompt nobody can answer", async () => {
    const client = fakeClient([
      { type: "permission.asked", properties: { id: "per_1", sessionID: "ses_old", permission: "bash", patterns: ["rm -rf x"] } },
      { type: "session.idle", properties: { sessionID: "ses_old" } },
    ]);
    const events: StudioEvent[] = [];
    const result = await createOpencodeRunner(client).run({
      prompt: "Corrige",
      sessionId: "ses_old",
      model: "m",
      cwd: "/ws",
      agentUid: 100001,
      timeoutMs: 5_000,
      onEvent: (event) => void events.push(event),
    });
    expect(client.calls).toEqual(["prompt ses_old openrouter/m", "reject per_1"]);
    expect(events).toContainEqual({ kind: "log", level: "error", text: "Permission refusée : bash rm -rf x" });
    expect(result.ok).toBe(true);
  });

  it("fails the turn on a session error", async () => {
    const client = fakeClient([{ type: "session.error", properties: { sessionID: "ses_new", error: { name: "ApiError", data: { message: "402 credit" } } } }]);
    const result = await createOpencodeRunner(client).run({ prompt: "p", sessionId: null, model: "m", cwd: "/ws", agentUid: 100001, timeoutMs: 5_000, onEvent: () => undefined });
    expect(result).toMatchObject({ ok: false, resultText: "402 credit" });
  });

  it("aborts the session on the server when the step times out", async () => {
    const client = fakeClient([], { hang: true });
    const events: StudioEvent[] = [];
    const result = await createOpencodeRunner(client).run({
      prompt: "p",
      sessionId: null,
      model: "m",
      cwd: "/ws",
      agentUid: 100001,
      timeoutMs: 50,
      onEvent: (event) => void events.push(event),
    });
    expect(result.ok).toBe(false);
    expect(client.calls).toContain("abort ses_new");
    expect(events).toContainEqual({ kind: "log", level: "error", text: "OpenCode step timed out after 50 ms" });
  });
});

describe("parseSse", () => {
  it("parses JSON data blocks split across chunks and skips the rest", async () => {
    const encoder = new TextEncoder();
    async function* body() {
      yield encoder.encode('data: {"type":"a"}\n\n: keep-alive\n\ndata: {"ty');
      yield encoder.encode('pe":"b"}\n\ndata: not json\n\n');
    }
    const parsed: unknown[] = [];
    for await (const event of parseSse(body())) parsed.push(event);
    expect(parsed).toEqual([{ type: "a" }, { type: "b" }]);
  });
});
