import { afterEach, describe, expect, it, vi } from "vitest";
import { costFromBody, createOpenrouterProxy, type OpenrouterProxy } from "./openrouter-proxy";

let proxy: OpenrouterProxy | null = null;
afterEach(async () => {
  await proxy?.close();
  proxy = null;
});

/** An upstream that answers each path with the given response and records what it received. */
function fakeUpstream(answers: Record<string, () => Response>) {
  const calls: { url: string; authorization: string | null; body: string }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, authorization: new Headers(init?.headers).get("authorization"), body: init?.body ? Buffer.from(init.body as Uint8Array).toString() : "" });
    const answer = Object.entries(answers).find(([path]) => url.includes(path))?.[1];
    return answer ? answer() : new Response("not found", { status: 404 });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

async function startProxy(upstream: ReturnType<typeof fakeUpstream>) {
  proxy = createOpenrouterProxy({ upstream: "https://openrouter.test/api/v1", apiKey: "sk-or-real", fetchImpl: upstream.fetchImpl, lookupDelaysMs: [0, 0], log: () => undefined });
  return proxy.start();
}

describe("openrouter proxy", () => {
  it("refuses a call without a valid token, and a path it does not forward", async () => {
    const upstream = fakeUpstream({});
    const base = await startProxy(upstream);
    expect((await fetch(`${base}/chat/completions`, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await fetch(`${base}/chat/completions`, { method: "POST", headers: { authorization: "Bearer sk-or-guess" }, body: "{}" })).status).toBe(401);

    const grant = proxy!.grant();
    expect((await fetch(`${base}/keys`, { method: "POST", headers: { authorization: `Bearer ${grant.token}` }, body: "{}" })).status).toBe(403);
    expect((await fetch(`${base}/chat/completions`, { headers: { authorization: `Bearer ${grant.token}` } })).status).toBe(403);
    grant.revoke();
    expect((await fetch(`${base}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${grant.token}` }, body: "{}" })).status).toBe(401);
    expect(upstream.calls).toEqual([]);
  });

  it("swaps the token for the platform key and streams the answer back untouched", async () => {
    const sse = 'data: {"choices":[{"delta":{"content":"Bon"}}]}\n\ndata: {"choices":[],"usage":{"cost":0.002}}\n\ndata: [DONE]\n\n';
    const upstream = fakeUpstream({ "/chat/completions": () => new Response(sse, { headers: { "content-type": "text/event-stream" } }) });
    const base = await startProxy(upstream);
    const grant = proxy!.grant({ track: true });

    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${grant.token}`, "content-type": "application/json" },
      body: '{"model":"m","stream":true}',
    });
    expect(await response.text()).toBe(sse);
    expect(upstream.calls).toEqual([{ url: "https://openrouter.test/api/v1/chat/completions", authorization: "Bearer sk-or-real", body: '{"model":"m","stream":true}' }]);
    expect(await grant.costUsd()).toBe(0.002);
  });

  it("looks up the cost of a binary answer from its generation id", async () => {
    const upstream = fakeUpstream({
      "/audio/speech": () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg", "x-generation-id": "gen-1" } }),
      "/generation?id=gen-1": () => Response.json({ data: { total_cost: 0.0015 } }),
    });
    const base = await startProxy(upstream);
    const grant = proxy!.grant({ track: true });
    const response = await fetch(`${base}/audio/speech`, { method: "POST", headers: { authorization: `Bearer ${grant.token}` }, body: "{}" });
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(await grant.costUsd()).toBe(0.0015);
  });

  it("does not add up the calls of an untracked token", async () => {
    const upstream = fakeUpstream({ "/chat/completions": () => Response.json({ usage: { cost: 0.4 } }) });
    const base = await startProxy(upstream);
    const grant = proxy!.grant();
    await (await fetch(`${base}/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${grant.token}` }, body: "{}" })).text();
    expect(await grant.costUsd()).toBe(0);
  });
});

describe("fal route", () => {
  it("forwards fal's queue calls with the fal key, and refuses them without one", async () => {
    const upstream = fakeUpstream({
      "queue.fal.test/fal-ai/flux/schnell/requests/r1/status": () => Response.json({ status: "COMPLETED" }),
      "queue.fal.test/fal-ai/flux/schnell": () => Response.json({ request_id: "r1" }),
    });
    proxy = createOpenrouterProxy({
      upstream: "https://openrouter.test/api/v1",
      apiKey: "sk-or-real",
      fal: { upstream: "https://queue.fal.test", apiKey: "fal-real" },
      fetchImpl: upstream.fetchImpl,
      log: () => undefined,
    });
    await proxy.start();
    const grant = proxy.grant();
    const headers = { authorization: `Key ${grant.token}`, "content-type": "application/json" };
    const submit = await fetch(`${grant.falBaseUrl}/fal-ai/flux/schnell`, { method: "POST", headers, body: '{"prompt":"cup"}' });
    expect(await submit.json()).toEqual({ request_id: "r1" });
    const status = await fetch(`${grant.falBaseUrl}/fal-ai/flux/schnell/requests/r1/status?logs=1`, { headers });
    expect(await status.json()).toEqual({ status: "COMPLETED" });
    expect(upstream.calls.map(({ url, authorization }) => [url, authorization])).toEqual([
      ["https://queue.fal.test/fal-ai/flux/schnell", "Key fal-real"],
      ["https://queue.fal.test/fal-ai/flux/schnell/requests/r1/status?logs=1", "Key fal-real"],
    ]);
    expect((await fetch(`${grant.falBaseUrl}/fal-ai/x`, { method: "POST", headers: { authorization: "Key nope" }, body: "{}" })).status).toBe(401);
    expect((await fetch(`${grant.falBaseUrl}/..%2Fsecret/x`, { method: "DELETE", headers })).status).toBe(403);
  });

  it("answers 503 when the studio has no fal key", async () => {
    const base = await startProxy(fakeUpstream({}));
    const grant = proxy!.grant();
    expect(grant.falBaseUrl).toBeNull();
    expect((await fetch(`${base.replace(/\/api\/v1$/, "")}/fal/fal-ai/x`, { method: "POST", headers: { authorization: `Key ${grant.token}` }, body: "{}" })).status).toBe(503);
  });
});

describe("costFromBody", () => {
  it("reads usage.cost from JSON or from SSE data lines", () => {
    expect(costFromBody('{"usage":{"cost":0.01}}')).toBe(0.01);
    expect(costFromBody('data: {"usage":{"cost":0.01}}\n\ndata: [DONE]\n\n')).toBe(0.01);
    expect(costFromBody("data: [DONE]")).toBeNull();
  });
});
