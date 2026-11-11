import { chmod, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { claudeChatInput, createClaudeChat } from "./claude-chat";
import type { ChatMessage } from "./structured";

const FAKE = resolve(__dirname, "../test/fake-claude-chat.mjs");
const schema = { type: "object", properties: { title: { type: "string" } } };

beforeAll(async () => {
  await chmod(FAKE, 0o755);
});

describe("claudeChatInput", () => {
  it("makes the system messages the system prompt and passes a single user message as it is, images included", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "Tu es réalisateur." },
      { role: "user", content: [{ type: "text", text: "La planche :" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } }] },
    ];
    expect(claudeChatInput(messages)).toEqual({
      system: "Tu es réalisateur.",
      content: [
        { type: "text", text: "La planche :" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
      ],
    });
  });

  it("quotes a refused answer and the correction asked, in order, in one user message", () => {
    const { content } = claudeChatInput([
      { role: "system", content: "S" },
      { role: "user", content: "Écris le brief." },
      { role: "assistant", content: '{"title":""}' },
      { role: "user", content: "Cette réponse est refusée : titre vide." },
    ]);
    expect(content.map((block) => (block.type === "text" ? block.text : "image"))).toEqual([
      "## Demande",
      "Écris le brief.",
      "## Ta réponse précédente",
      '{"title":""}',
      "## Suite de la demande",
      "Cette réponse est refusée : titre vide.",
    ]);
  });
});

describe("createClaudeChat", () => {
  async function chat(mode = "ok") {
    const cwd = await mkdtemp(join(tmpdir(), "claude-chat-"));
    return { cwd, call: createClaudeChat({ bin: FAKE, cwd, env: { ...process.env, FAKE_CLAUDE_MODE: mode } as Record<string, string> }) };
  }
  const messages: ChatMessage[] = [
    { role: "system", content: "Réponds en JSON." },
    { role: "user", content: "Un titre ?" },
  ];

  it("runs claude -p without tools nor session, with the model, the system prompt and the JSON schema, and reads its structured output", async () => {
    const { cwd, call } = await chat();
    const answer = await call({ model: "claude-sonnet-5-5", messages, name: "brief", schema, jsonSchema: true, timeoutMs: 10_000 });
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    const echo = JSON.parse(answer.content) as { args: string[]; system: string; content: string[] };
    expect(echo.system).toBe("Réponds en JSON.");
    expect(echo.content).toEqual(["Un titre ?"]);
    expect(echo.args).toEqual(expect.arrayContaining(["-p", "--no-session-persistence", "--strict-mcp-config"]));
    expect(echo.args[echo.args.indexOf("--model") + 1]).toBe("claude-sonnet-5-5");
    expect(echo.args[echo.args.indexOf("--tools") + 1]).toBe("");
    expect(JSON.parse(echo.args[echo.args.indexOf("--json-schema") + 1])).toEqual(schema);
    expect(answer.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
    // The system prompt's folder is removed after the call.
    expect(await readdir(cwd)).toEqual([]);
  });

  it("asks for any JSON object without the schema when the caller says so, and reads a plain text answer", async () => {
    const { call } = await chat("text");
    const answer = await call({ model: "haiku", messages, name: "brief", schema, jsonSchema: false, timeoutMs: 10_000 });
    expect(answer.ok).toBe(true);
    if (answer.ok) expect((JSON.parse(answer.content) as { args: string[] }).args).not.toContain("--json-schema");
  });

  it("reports an error result, and a claude that stops without answering", async () => {
    expect(await (await chat("fail")).call({ model: "opus", messages, name: "brief", schema, jsonSchema: true, timeoutMs: 10_000 })).toMatchObject({
      ok: false,
      error: expect.stringContaining("schema non respecté"),
    });
    expect(await (await chat("silent")).call({ model: "opus", messages, name: "brief", schema, jsonSchema: true, timeoutMs: 10_000 })).toMatchObject({
      ok: false,
      error: expect.stringContaining("sans réponse"),
    });
  });

  it("says when the claude command cannot be run", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "claude-chat-"));
    const call = createClaudeChat({ bin: join(cwd, "absent"), cwd });
    expect(await call({ model: "opus", messages, name: "brief", schema, jsonSchema: true, timeoutMs: 10_000 })).toMatchObject({ ok: false, error: expect.stringContaining("introuvable") });
  });
});
