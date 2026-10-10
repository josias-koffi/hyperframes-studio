/**
 * OpenCode server events (`GET /event`, one JSON object per SSE `data:` line) turned into the studio's event
 * model. A part is sent again on every change (a text grows, a tool goes pending → running → completed), so the
 * translator keeps what it already emitted and only reports a part once it is final.
 */
import type { StudioEvent, TokenUsage } from "./claude-events";

type Json = Record<string, unknown>;

const SUMMARY_MAX = 300;

function clip(text: string, max = SUMMARY_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function summarizeToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return name;
  const value = input as Json;
  const candidate = value.command ?? value.filePath ?? value.path ?? value.pattern ?? value.name ?? value.url ?? value.description;
  return typeof candidate === "string" ? clip(candidate) : name;
}

function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return "OpenCode error";
  const value = error as Json;
  const message = (value.data as Json | undefined)?.message ?? value.message;
  return typeof message === "string" ? message : typeof value.name === "string" ? value.name : "OpenCode error";
}

/** How one OpenCode turn ended: `session.idle` after the work, or `session.error`. */
export type OpencodeTurnEnd = { ok: boolean; error?: string };

export type OpencodeTranslation = { events: StudioEvent[]; end?: OpencodeTurnEnd };

export type OpencodeTranslator = {
  translate(event: unknown): OpencodeTranslation;
  /** Total cost (USD) and tokens of the steps finished so far. */
  totals(): { costUsd: number; usage: TokenUsage };
  /** The last text the assistant wrote: the turn's summary. */
  lastText(): string | null;
};

export function createOpencodeTranslator(sessionId: string): OpencodeTranslator {
  /** Parts already reported, with the state they were reported in. */
  const reported = new Map<string, string>();
  let costUsd = 0;
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  let lastText: string | null = null;
  let error: string | null = null;

  const once = (partId: string, state: string) => {
    if (reported.get(partId) === state) return false;
    reported.set(partId, state);
    return true;
  };

  function translatePart(part: Json): StudioEvent[] {
    const id = String(part.id);
    switch (part.type) {
      case "text": {
        const time = part.time as Json | undefined;
        if (part.synthetic === true || typeof part.text !== "string" || !part.text.trim() || time?.end === undefined) return [];
        if (!once(id, "done")) return [];
        lastText = part.text;
        return [{ kind: "text", text: part.text }];
      }
      case "tool": {
        const name = String(part.tool);
        const state = (part.state ?? {}) as Json;
        // Reported once finished, call and result together: a text written meanwhile would split them in the log.
        if (state.status !== "completed" && state.status !== "error") return [];
        if (!once(id, "done")) return [];
        const call: StudioEvent = { kind: "tool", name, summary: summarizeToolInput(name, state.input) };
        return state.status === "completed"
          ? [call, { kind: "tool_result", isError: false, summary: clip(String(state.output ?? "")) }]
          : [call, { kind: "tool_result", isError: true, summary: clip(String(state.error ?? "")) }];
      }
      case "step-finish": {
        if (!once(id, "done")) return [];
        costUsd += typeof part.cost === "number" ? part.cost : 0;
        const tokens = (part.tokens ?? {}) as Json;
        const cache = (tokens.cache ?? {}) as Json;
        const n = (value: unknown) => (typeof value === "number" ? value : 0);
        usage.inputTokens += n(tokens.input);
        usage.outputTokens += n(tokens.output) + n(tokens.reasoning);
        usage.cacheReadTokens += n(cache.read);
        usage.cacheCreationTokens += n(cache.write);
        return [];
      }
      default:
        return [];
    }
  }

  return {
    translate(raw) {
      if (!raw || typeof raw !== "object") return { events: [] };
      const event = raw as Json;
      const properties = (event.properties ?? {}) as Json;
      const owner = properties.sessionID ?? (properties.part as Json | undefined)?.sessionID ?? (properties.info as Json | undefined)?.sessionID;
      // A session error without a session id is the server's, so it ends this turn too.
      if (owner !== sessionId && !(event.type === "session.error" && owner === undefined)) return { events: [] };

      switch (event.type) {
        case "message.part.updated":
          return { events: translatePart((properties.part ?? {}) as Json) };
        case "message.updated": {
          const info = (properties.info ?? {}) as Json;
          if (info.role === "assistant" && info.error) error = errorText(info.error);
          return { events: [] };
        }
        case "session.status": {
          const status = (properties.status ?? {}) as Json;
          if (status.type === "retry") {
            return { events: [{ kind: "log", level: "info", text: clip(`Nouvel essai (${String(status.attempt)}) : ${String(status.message)}`) }] };
          }
          if (status.type === "idle") return { events: [], end: error ? { ok: false, error } : { ok: true } };
          return { events: [] };
        }
        case "session.idle":
          return { events: [], end: error ? { ok: false, error } : { ok: true } };
        case "session.error": {
          error = errorText(properties.error);
          return { events: [{ kind: "log", level: "error", text: clip(error) }], end: { ok: false, error } };
        }
        default:
          return { events: [] };
      }
    },
    totals: () => ({ costUsd, usage: { ...usage } }),
    lastText: () => lastText,
  };
}
