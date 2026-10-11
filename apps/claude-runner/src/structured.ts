import type { StudioEvent, TokenUsage } from "@studio/shared";

/** A message of OpenRouter's chat API; a vision model also gets images (`image_url` with a data URI). */
export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatPart[] };

/** Where structured calls go: the job's proxy token, so each call is billed to the job like the voice and music. */
export type ModelCallContext = {
  openrouter: { baseUrl: string; token: string } | null;
  timeoutMs: number;
  onEvent: (event: StudioEvent) => Promise<void> | void;
  fetchImpl?: typeof fetch;
};

type ChatAnswer = { ok: true; content: string; usage?: TokenUsage; costUsd: number } | { ok: false; status: number; error: string };

async function chat(ctx: ModelCallContext, model: string, messages: ChatMessage[], name: string, schema: Record<string, unknown>, jsonSchema: boolean): Promise<ChatAnswer> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ctx.openrouter!.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${ctx.openrouter!.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      response_format: jsonSchema ? { type: "json_schema", json_schema: { name, strict: false, schema } } : { type: "json_object" },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(Math.min(ctx.timeoutMs, 5 * 60 * 1000)),
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, status: response.status, error: text.slice(0, 1000) };
  const body = JSON.parse(text) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    error?: { message?: string };
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return { ok: false, status: 502, error: body.error?.message ?? "réponse vide du modèle" };
  const usage = body.usage
    ? { inputTokens: body.usage.prompt_tokens ?? 0, outputTokens: body.usage.completion_tokens ?? 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
    : undefined;
  return { ok: true, content, usage, costUsd: body.usage?.cost ?? 0 };
}

export const addUsage = (a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage | undefined =>
  !a ? b : !b ? a : { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 };

/** Invalid answers the step's model may give before the escalation model takes over (`escalation` slot). */
export const ANSWERS_BEFORE_ESCALATION = 2;
/** Answers each model may give: the step's model alone, or two then two more from the escalation model. */
export const ANSWERS_WITHOUT_ESCALATION = 3;
export const ANSWERS_AFTER_ESCALATION = 2;

/** The escalation of a step: the model that took over and what its turns cost (USD, part of the job's cost). */
export type Escalation = { model: string; costUsd: number };

export type StructuredOutcome<T> = {
  value: T | null;
  errors: string[];
  warnings: string[];
  usage?: TokenUsage;
  /** What OpenRouter billed for every answer (already counted in the job's proxy cost). */
  costUsd: number;
  escalation?: Escalation;
};

export type StructuredRequest<T> = {
  /** What is asked, for the logs: « Storyboard », « Brief »… */
  label: string;
  name: string;
  schema: Record<string, unknown>;
  messages: ChatMessage[];
  model: string;
  /** A stronger model for when the step's model fails twice; null or the same model: no escalation. */
  escalationModel?: string | null;
  /** Checks an answer: the value, or the errors sent back to the model. */
  check: (content: string) => Promise<{ value: T | null; errors: string[]; warnings?: string[] }>;
};

/**
 * One structured call, answered again with the errors until the answer passes. After two refused answers the
 * escalation model takes over the same conversation. A model that refuses `json_schema` is asked once more with
 * `json_object`: the check has the last word either way.
 */
export async function structuredCall<T>(ctx: ModelCallContext, request: StructuredRequest<T>): Promise<StructuredOutcome<T>> {
  const escalate = request.escalationModel && request.escalationModel !== request.model ? request.escalationModel : null;
  const turns: { model: string; answers: number }[] = escalate
    ? [
        { model: request.model, answers: ANSWERS_BEFORE_ESCALATION },
        { model: escalate, answers: ANSWERS_AFTER_ESCALATION },
      ]
    : [{ model: request.model, answers: ANSWERS_WITHOUT_ESCALATION }];
  const messages = [...request.messages];
  const outcome: StructuredOutcome<T> = { value: null, errors: [], warnings: [], costUsd: 0 };
  let total = 0;
  const all = turns.reduce((sum, turn) => sum + turn.answers, 0);

  for (const [index, turn] of turns.entries()) {
    if (index > 0) {
      outcome.escalation = { model: turn.model, costUsd: 0 };
      await ctx.onEvent({ kind: "log", level: "info", text: `Escalade : ${request.label} refusé ${ANSWERS_BEFORE_ESCALATION} fois, ${turn.model} reprend.` });
    }
    let jsonSchema = true;
    for (let answer = 1; answer <= turn.answers; answer++) {
      total++;
      let reply = await chat(ctx, turn.model, messages, request.name, request.schema, jsonSchema);
      if (!reply.ok && jsonSchema && reply.status >= 400 && reply.status < 500) {
        await ctx.onEvent({ kind: "log", level: "info", text: `${turn.model} refuse json_schema (HTTP ${reply.status}) : nouvel essai en json_object.` });
        jsonSchema = false;
        reply = await chat(ctx, turn.model, messages, request.name, request.schema, jsonSchema);
      }
      if (!reply.ok) {
        outcome.errors = [`Appel de ${turn.model} refusé (HTTP ${reply.status}) : ${reply.error}`];
        // A model that cannot be called at all is skipped for the escalation, not retried.
        break;
      }
      outcome.usage = addUsage(outcome.usage, reply.usage);
      outcome.costUsd += reply.costUsd;
      if (outcome.escalation) outcome.escalation.costUsd += reply.costUsd;
      const checked = await request.check(reply.content);
      if (checked.value !== null && checked.errors.length === 0) return { ...outcome, value: checked.value, errors: [], warnings: checked.warnings ?? [] };
      outcome.errors = checked.errors;
      await ctx.onEvent({ kind: "log", level: "info", text: `${request.label} refusé (essai ${total}/${all}) :\n- ${checked.errors.join("\n- ")}` });
      messages.push(
        { role: "assistant", content: reply.content },
        { role: "user", content: `Cette réponse est refusée :\n- ${checked.errors.join("\n- ")}\n\nCorrige ces points et renvoie la réponse complète, en JSON seulement.` },
      );
    }
  }
  return outcome;
}
