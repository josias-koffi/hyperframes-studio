import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ChatAnswer, ChatMessage, ChatTransport } from "./structured";

/** A content block of Claude Code's `stream-json` input (the Messages API's): text, or an image. */
export type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string } };

function imageBlock(url: string): ClaudeBlock {
  const data = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return data ? { type: "image", source: { type: "base64", media_type: data[1], data: data[2] } } : { type: "image", source: { type: "url", url } };
}

function blocksOf(content: ChatMessage["content"]): ClaudeBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((part) => (part.type === "text" ? { type: "text", text: part.text } : imageBlock(part.image_url.url)));
}

/**
 * The conversation as `claude -p` takes it: the system messages become its system prompt, the rest one user message.
 * A conversation that goes on after an answer (a refused answer and the errors to correct) quotes that answer: the
 * model sees what it said and what is asked of it now.
 */
export function claudeChatInput(messages: readonly ChatMessage[]): { system: string; content: ClaudeBlock[] } {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => (typeof message.content === "string" ? message.content : message.content.map((part) => (part.type === "text" ? part.text : "")).join("\n")))
    .join("\n\n");
  const turns = messages.filter((message) => message.role !== "system");
  if (turns.length === 1) return { system, content: blocksOf(turns[0].content) };
  const content: ClaudeBlock[] = [];
  for (const [index, message] of turns.entries()) {
    const heading = message.role === "assistant" ? "## Ta réponse précédente" : index === 0 ? "## Demande" : "## Suite de la demande";
    content.push({ type: "text", text: heading }, ...blocksOf(message.content));
  }
  return { system, content };
}

/** The arguments of one structured answer: no tool, no session kept, no MCP server of the host's config. */
export function claudeChatArgs({ model, systemFile, schema }: { model: string; systemFile: string; schema: Record<string, unknown> | null }): string[] {
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
    "--system-prompt-file",
    systemFile,
    "--tools",
    "",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--permission-mode",
    "dontAsk",
  ];
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  return args;
}

type ClaudeResultLine = {
  type: "result";
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
};

/** What a `result` line says: the answer as JSON text (the structured output when there is one), or the error. */
export function claudeChatAnswer(line: ClaudeResultLine | null, stderr: string, exitCode: number | null): ChatAnswer {
  if (!line) return { ok: false, status: 502, error: `claude s'est arrêté sans réponse (code ${exitCode ?? "?"}) : ${stderr.trim().slice(-800) || "rien sur stderr"}` };
  if (line.is_error || (line.subtype && line.subtype !== "success")) return { ok: false, status: 502, error: `${line.subtype ?? "erreur"} : ${(line.result ?? stderr).slice(0, 800)}` };
  const content = line.structured_output !== undefined && line.structured_output !== null ? JSON.stringify(line.structured_output) : (line.result ?? "");
  if (!content.trim()) return { ok: false, status: 502, error: "réponse vide du modèle" };
  const usage = line.usage
    ? {
        inputTokens: line.usage.input_tokens ?? 0,
        outputTokens: line.usage.output_tokens ?? 0,
        cacheReadTokens: line.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: line.usage.cache_creation_input_tokens ?? 0,
      }
    : undefined;
  // What the answer would cost at API prices: the subscription is not billed per call (like the agent turns).
  return { ok: true, content, usage, costUsd: line.total_cost_usd ?? 0 };
}

export type ClaudeChatOptions = {
  bin: string;
  /** Where `claude` runs: a folder of its own, so no project CLAUDE.md is read into the call. */
  cwd: string;
  env?: Record<string, string>;
};

/**
 * Structured calls answered by `claude -p` on the person's own subscription: the blocks engine's brief, storyboard,
 * repairs and visual check when their engine is Claude Code. The JSON schema goes through `--json-schema`; the check
 * of the answer stays the caller's. Calls run one at a time: the subscription's quota is shared.
 */
export function createClaudeChat({ bin, cwd, env }: ClaudeChatOptions): ChatTransport {
  let queue: Promise<unknown> = Promise.resolve();
  const call: ChatTransport = async ({ model, messages, schema, jsonSchema, timeoutMs }) => {
    await mkdir(cwd, { recursive: true });
    const dir = await mkdtemp(join(cwd, "chat-"));
    try {
      const { system, content } = claudeChatInput(messages);
      const systemFile = join(dir, "system.md");
      await writeFile(systemFile, system);
      return await new Promise<ChatAnswer>((resolvePromise) => {
        const child = spawn(bin, claudeChatArgs({ model, systemFile, schema: jsonSchema ? schema : null }), {
          cwd: dir,
          env: env ?? process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let result: ClaudeResultLine | null = null;
        let stderr = "";
        const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
        createInterface({ input: child.stdout }).on("line", (text) => {
          try {
            const parsed = JSON.parse(text) as { type?: string };
            if (parsed.type === "result") result = parsed as ClaudeResultLine;
          } catch {
            // A line that is not JSON (a warning) is not the answer.
          }
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr = (stderr + chunk.toString()).slice(-4000);
        });
        child.on("error", (error) => {
          clearTimeout(timer);
          resolvePromise({ ok: false, status: 502, error: `claude introuvable ou impossible à lancer : ${error.message}` });
        });
        child.on("close", (exitCode) => {
          clearTimeout(timer);
          resolvePromise(claudeChatAnswer(result, stderr, exitCode));
        });
        // A command that could not start, or stopped before reading, closes its stdin: `error` or `close` says why.
        child.stdin.on("error", () => undefined);
        child.stdin.end(`${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`);
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  return (request) => {
    const answer = queue.then(() => call(request));
    queue = answer.catch(() => undefined);
    return answer;
  };
}
