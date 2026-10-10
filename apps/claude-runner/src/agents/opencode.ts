import type { ChildProcess } from "node:child_process";
import { createOpencodeTranslator } from "@studio/shared";
import { spawnAgent, type AgentIdentity, type Sandbox } from "../sandbox";
import type { AgentRunner } from "./types";

/** The few calls of the OpenCode server API the runner needs (`opencode serve`, HTTP + SSE). */
export type OpencodeClient = {
  createSession(directory: string, title: string): Promise<string>;
  prompt(directory: string, sessionId: string, model: { providerID: string; modelID: string }, text: string): Promise<void>;
  abort(directory: string, sessionId: string): Promise<void>;
  rejectPermission(directory: string, requestId: string, message: string): Promise<void>;
  /** The server's event stream, opened before the prompt is sent so that no event is missed. */
  events(directory: string, signal: AbortSignal): Promise<AsyncIterable<unknown>>;
};

/** `password` is the server's `OPENCODE_SERVER_PASSWORD`: another client's agent can reach 127.0.0.1 too. */
export function createOpencodeHttpClient(baseUrl: string, password?: string): OpencodeClient {
  const url = (path: string, directory: string) => `${baseUrl}${path}?directory=${encodeURIComponent(directory)}`;
  const auth: Record<string, string> = password ? { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` } : {};
  const call = async (path: string, directory: string, body?: unknown) => {
    const response = await fetch(url(path, directory), {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) throw new Error(`OpenCode ${path}: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
    return response;
  };

  return {
    async createSession(directory, title) {
      const session = (await (await call("/session", directory, { title })).json()) as { id: string };
      return session.id;
    },
    async prompt(directory, sessionId, model, text) {
      await call(`/session/${sessionId}/prompt_async`, directory, { model, parts: [{ type: "text", text }] });
    },
    async abort(directory, sessionId) {
      await call(`/session/${sessionId}/abort`, directory);
    },
    async rejectPermission(directory, requestId, message) {
      await call(`/permission/${requestId}/reply`, directory, { reply: "reject", message });
    },
    async events(directory, signal) {
      const response = await fetch(url("/event", directory), { headers: { accept: "text/event-stream", ...auth }, signal });
      if (!response.ok || !response.body) throw new Error(`OpenCode /event: HTTP ${response.status}`);
      return parseSse(response.body);
    },
  };
}

/** `data:` lines of a Server-Sent-Events body, parsed as JSON. */
export async function* parseSse(body: AsyncIterable<Uint8Array>): AsyncIterable<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        yield JSON.parse(data) as unknown;
      } catch {
        // A keep-alive or a line that is not JSON: nothing to report.
      }
    }
  }
}

/** OpenRouter is the only provider: the model id is the OpenRouter one (`vendor/model`). */
const PROVIDER_ID = "openrouter";

/**
 * One OpenCode turn: open (or resume) the session, send the prompt, follow the event stream until the session
 * goes idle or fails. The timeout aborts the session on the server, not just the wait.
 */
export function createOpencodeRunner(client: OpencodeClient): AgentRunner {
  return {
    async run({ prompt, sessionId, model, cwd, timeoutMs, onEvent }) {
      const started = Date.now();
      const id = sessionId ?? (await client.createSession(cwd, prompt.slice(0, 80)));
      await onEvent({ kind: "session", sessionId: id, model });

      const translator = createOpencodeTranslator(id);
      const stream = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        stream.abort();
        client.abort(cwd, id).catch(() => undefined);
      }, timeoutMs);

      let end: { ok: boolean; error?: string } | undefined;
      try {
        const events = await client.events(cwd, stream.signal);
        await client.prompt(cwd, id, { providerID: PROVIDER_ID, modelID: model }, prompt);
        for await (const raw of events) {
          const event = raw as { type?: string; properties?: { id?: string; sessionID?: string; permission?: string; patterns?: string[] } };
          // Nobody can answer a permission prompt: what opencode.json does not allow is refused.
          if (event.type === "permission.asked" && event.properties?.sessionID === id && event.properties.id) {
            const what = `${event.properties.permission ?? "?"} ${(event.properties.patterns ?? []).join(" ")}`.trim();
            await onEvent({ kind: "log", level: "error", text: `Permission refusée : ${what}` });
            await client.rejectPermission(cwd, event.properties.id, "Non autorisé dans le studio.");
            continue;
          }
          const translation = translator.translate(raw);
          for (const studioEvent of translation.events) await onEvent(studioEvent);
          if (translation.end) {
            end = translation.end;
            break;
          }
        }
      } catch (error) {
        if (!timedOut) throw error;
      } finally {
        clearTimeout(timer);
        stream.abort();
      }

      if (timedOut) await onEvent({ kind: "log", level: "error", text: `OpenCode step timed out after ${timeoutMs} ms` });
      const { costUsd, usage } = translator.totals();
      const ok = !timedOut && end?.ok === true;
      const resultText = translator.lastText() ?? end?.error ?? null;
      await onEvent({ kind: "result", ok, sessionId: id, text: resultText ?? undefined, durationMs: Date.now() - started, costUsd, usage });
      return { ok, sessionId: id, resultText, costUsd, usage };
    },
  };
}

/**
 * Starts `opencode serve` as a client's agent, in the workspace, and resolves with its URL once it listens. The
 * port is the system's: one server runs per client.
 */
export function startOpencodeServer({
  bin,
  cwd,
  sandbox,
  identity,
  env,
  timeoutMs = 30_000,
}: {
  bin: string;
  cwd: string;
  sandbox: Sandbox;
  identity: AgentIdentity;
  env: Record<string, string>;
  timeoutMs?: number;
}) {
  return new Promise<{ url: string; process: ChildProcess }>((resolvePromise, reject) => {
    const child = spawnAgent(sandbox, identity, bin, ["serve", "--hostname=127.0.0.1", "--port=0"], {
      cwd,
      env: { ...env, OPENCODE_DISABLE_AUTOUPDATE: "true" },
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`opencode serve did not start within ${timeoutMs} ms:\n${output.slice(-2000)}`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /opencode server listening on\s+(https?:\/\/\S+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        resolvePromise({ url: match[1].replace(/\/$/, ""), process: child });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`opencode serve exited with code ${code}:\n${output.slice(-2000)}`));
    });
  });
}
