/**
 * Claude Code headless output (`claude -p --output-format stream-json --verbose`):
 * one JSON object per line. This module turns those lines into the small event
 * model the studio stores and streams to the UI.
 */

export type StudioEvent =
  | { kind: "session"; sessionId: string; model?: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; summary: string }
  | { kind: "tool_result"; isError: boolean; summary: string }
  | {
      kind: "result";
      ok: boolean;
      sessionId?: string;
      text?: string;
      numTurns?: number;
      durationMs?: number;
      /** What the turn would cost at API prices (`total_cost_usd`); a subscription is not billed per turn. */
      costUsd?: number;
      usage?: TokenUsage;
    }
  | { kind: "log"; level: "info" | "error"; text: string };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

type Json = Record<string, unknown>;

function tokenUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const value = (key: string) => {
    const n = (usage as Json)[key];
    return typeof n === "number" ? n : 0;
  };
  return {
    inputTokens: value("input_tokens"),
    outputTokens: value("output_tokens"),
    cacheReadTokens: value("cache_read_input_tokens"),
    cacheCreationTokens: value("cache_creation_input_tokens"),
  };
}

const SUMMARY_MAX = 300;

function clip(text: string, max = SUMMARY_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function summarizeToolInput(name: string, input: Json | undefined): string {
  if (!input) return name;
  const candidate =
    input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.skill ?? input.url ?? input.description;
  return typeof candidate === "string" ? clip(candidate) : name;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && typeof (part as Json).text === "string" ? (part as Json).text : ""))
      .join("");
  }
  return "";
}

/** Maps one stream-json line to zero or more studio events. Unknown lines are ignored. */
export function parseClaudeStreamLine(line: string): StudioEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let message: Json;
  try {
    message = JSON.parse(trimmed) as Json;
  } catch {
    return [{ kind: "log", level: "info", text: clip(trimmed) }];
  }

  switch (message.type) {
    case "system":
      if (message.subtype === "init" && typeof message.session_id === "string") {
        return [{ kind: "session", sessionId: message.session_id, model: message.model as string | undefined }];
      }
      return [];
    case "assistant": {
      const content = ((message.message as Json | undefined)?.content ?? []) as Json[];
      const events: StudioEvent[] = [];
      for (const part of content) {
        if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
          events.push({ kind: "text", text: part.text });
        } else if (part.type === "tool_use" && typeof part.name === "string") {
          events.push({ kind: "tool", name: part.name, summary: summarizeToolInput(part.name, part.input as Json) });
        }
      }
      return events;
    }
    case "user": {
      const content = ((message.message as Json | undefined)?.content ?? []) as Json[];
      if (!Array.isArray(content)) return [];
      return content
        .filter((part) => part.type === "tool_result")
        .map((part) => ({ kind: "tool_result" as const, isError: part.is_error === true, summary: clip(contentText(part.content)) }));
    }
    case "result":
      return [
        {
          kind: "result",
          ok: message.subtype === "success" && message.is_error !== true,
          sessionId: message.session_id as string | undefined,
          text: typeof message.result === "string" ? message.result : undefined,
          numTurns: message.num_turns as number | undefined,
          durationMs: message.duration_ms as number | undefined,
          costUsd: typeof message.total_cost_usd === "number" ? message.total_cost_usd : undefined,
          usage: tokenUsage(message.usage),
        },
      ];
    default:
      return [];
  }
}
