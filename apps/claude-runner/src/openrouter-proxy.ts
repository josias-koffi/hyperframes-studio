import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

/**
 * The OpenRouter key never reaches an agent: OpenCode and `scripts/audio.mjs` call this proxy with a token of
 * their own, and the proxy swaps it for the platform key. A job's token also adds up what its media calls cost
 * (voice, music), which no agent event reports.
 */
export const PROXY_PATHS = ["/chat/completions", "/audio/speech"] as const;

export type ProxyGrant = {
  token: string;
  /** Base URL to give the agent, in place of `https://openrouter.ai/api/v1`. */
  baseUrl: string;
  /** Cost (USD) of the calls made with this token, once the pending cost lookups have settled. */
  costUsd(): Promise<number>;
  revoke(): void;
};

export type OpenrouterProxy = {
  start(): Promise<string>;
  grant(options?: { track?: boolean }): ProxyGrant;
  close(): Promise<void>;
};

type Grant = { track: boolean; cost: number; pending: Set<Promise<void>> };

const JSON_LIMIT = 5 * 1024 * 1024;
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length", "upgrade"]);

function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolvePromise(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

/** `usage.cost` of a JSON body or of the data lines of an SSE stream (the last chunk carries it). */
export function costFromBody(text: string): number | null {
  const costOf = (value: unknown) => {
    const cost = (value as { usage?: { cost?: unknown } } | null)?.usage?.cost;
    return typeof cost === "number" ? cost : null;
  };
  try {
    return costOf(JSON.parse(text));
  } catch {
    let total: number | null = null;
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const cost = costOf(JSON.parse(line.slice(5).trim()));
        if (cost !== null) total = (total ?? 0) + cost;
      } catch {
        // `[DONE]`, keep-alives.
      }
    }
    return total;
  }
}

function fail(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: { code: status, message } }));
}

export function createOpenrouterProxy({
  upstream,
  apiKey,
  fetchImpl = fetch,
  lookupDelaysMs = [1_000, 3_000, 10_000],
  log = (text: string) => console.warn(`[openrouter-proxy] ${text}`),
}: {
  upstream: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Waits before each `/generation` lookup: its stats appear a moment after the response. */
  lookupDelaysMs?: number[];
  log?: (text: string) => void;
}): OpenrouterProxy {
  const grants = new Map<string, Grant>();
  const base = upstream.replace(/\/$/, "");
  let baseUrl = "";

  /** A binary answer (`/audio/speech`) says nothing of its cost: OpenRouter's stats of the generation do. */
  async function lookupCost(generationId: string): Promise<number | null> {
    for (const delay of lookupDelaysMs) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
      const response = await fetchImpl(`${base}/generation?id=${encodeURIComponent(generationId)}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      }).catch(() => null);
      if (!response?.ok) continue;
      const body = (await response.json().catch(() => null)) as { data?: { total_cost?: unknown } } | null;
      if (typeof body?.data?.total_cost === "number") return body.data.total_cost;
    }
    return null;
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const path = (request.url ?? "").split("?")[0].replace(/^\/api\/v1/, "");
    const token = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "")?.[1]?.trim();
    const grant = token ? grants.get(token) : undefined;
    if (!grant) return fail(response, 401, "Jeton du studio absent ou expiré.");
    if (request.method !== "POST" || !(PROXY_PATHS as readonly string[]).includes(path)) {
      log(`refused ${request.method} ${path}`);
      return fail(response, 403, `Appel non autorisé par le studio : ${request.method} ${path}`);
    }

    const body = await readBody(request, 64 * 1024 * 1024);
    const upstreamResponse = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": request.headers["content-type"] ?? "application/json",
        accept: request.headers.accept ?? "*/*",
        "http-referer": "https://framesmith.studio",
        "x-title": "Framesmith",
      },
      body: new Uint8Array(body),
    });

    const headers: Record<string, string> = {};
    upstreamResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key)) headers[key] = value;
    });
    response.writeHead(upstreamResponse.status, headers);
    if (!upstreamResponse.body) return response.end();

    const type = upstreamResponse.headers.get("content-type") ?? "";
    const textual = type.includes("json") || type.includes("event-stream");
    let seen = "";
    const stream = Readable.fromWeb(upstreamResponse.body as import("node:stream/web").ReadableStream<Uint8Array>);
    stream.on("data", (chunk: Buffer) => {
      if (grant.track && textual && seen.length < JSON_LIMIT) seen += chunk.toString();
    });
    stream.pipe(response);
    await new Promise<void>((resolvePromise) => stream.on("end", resolvePromise).on("error", () => resolvePromise()));

    if (!grant.track || !upstreamResponse.ok) return;
    const cost = textual ? costFromBody(seen) : null;
    if (cost !== null) {
      grant.cost += cost;
      return;
    }
    const generationId = upstreamResponse.headers.get("x-generation-id");
    if (!generationId) return log(`no cost for ${path}`);
    const lookup = lookupCost(generationId).then((found) => {
      if (found === null) log(`no cost found for generation ${generationId}`);
      else grant.cost += found;
    });
    grant.pending.add(lookup);
    void lookup.finally(() => grant.pending.delete(lookup));
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      log(`proxy error: ${error instanceof Error ? error.message : String(error)}`);
      if (!response.headersSent) fail(response, 502, "Erreur du proxy OpenRouter du studio.");
      else response.end();
    });
  });

  return {
    start: () =>
      new Promise((resolvePromise, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
          resolvePromise(baseUrl);
        });
      }),
    grant({ track = false } = {}) {
      if (!baseUrl) throw new Error("OpenRouter proxy not started");
      const token = `sk-studio-${randomBytes(24).toString("hex")}`;
      const grant: Grant = { track, cost: 0, pending: new Set() };
      grants.set(token, grant);
      return {
        token,
        baseUrl,
        async costUsd() {
          await Promise.all([...grant.pending]);
          return grant.cost;
        },
        revoke: () => void grants.delete(token),
      };
    },
    close: () => new Promise((resolvePromise) => server.close(() => resolvePromise())),
  };
}
