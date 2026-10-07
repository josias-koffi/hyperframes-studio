import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { afterEach, describe, expect, it } from "vitest";
import { createGateway } from "./gateway";
import type { CreateStudio } from "./studio-cli";

const overridesDir = join(__dirname, "..", "public");

/** Stand-in for the CLI's Studio server: a page, the project's API, and an events stream the test drives. */
function fakeStudios() {
  const emitters = new Map<string, (path: string) => void>();
  const shutdowns: string[] = [];
  const createStudio: CreateStudio = ({ projectName }) => {
    const app = new Hono();
    app.get("/", (c) => c.html(`<html><head><title>${projectName}</title></head><body></body></html>`));
    app.get("/api/projects", (c) => c.json({ projects: [{ id: projectName }] }));
    app.get("/api/projects/:id/files", (c) => c.json({ project: projectName, asked: c.req.param("id") }));
    app.get("/api/events", (c) =>
      streamSSE(c, async (stream) => {
        emitters.set(projectName, (path) => {
          void stream.writeSSE({ event: "file-change", data: JSON.stringify({ projectId: projectName, path }) });
        });
        while (!stream.aborted) await stream.sleep(50);
      }),
    );
    return {
      app,
      async shutdown() {
        shutdowns.push(projectName);
      },
    };
  };
  return { createStudio, emitters, shutdowns };
}

describe("hf-studio gateway", () => {
  const cleanups: Array<() => unknown> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  function start({ token = "", frameAncestors = "" } = {}) {
    const workspaceDir = mkdtempSync(join(tmpdir(), "hf-gateway-"));
    for (const slug of ["demo", "other"]) mkdirSync(join(workspaceDir, "videos", slug), { recursive: true });
    const studios = fakeStudios();
    const gateway = createGateway({ workspaceDir, createStudio: studios.createStudio, token, frameAncestors, overridesDir });
    cleanups.push(() => rmSync(workspaceDir, { recursive: true, force: true }));
    cleanups.push(() => gateway.close());
    const request = (path: string, init?: RequestInit) => gateway.app.fetch(new Request(`http://gateway${path}`, init));
    const open = (slug: string, auth?: string) =>
      request("/__gateway/open", {
        method: "POST",
        headers: auth ? { authorization: `Bearer ${auth}` } : {},
        body: JSON.stringify({ slug }),
      });
    return { gateway, studios, request, open };
  }

  it("says no project is open before the first open", async () => {
    const { request } = start();
    expect((await request("/")).status).toBe(503);
  });

  it("keeps every opened project and routes its API to it", async () => {
    const { request, open } = start();
    expect((await open("demo")).status).toBe(200);
    expect((await open("other")).status).toBe(200);

    expect(await (await request("/api/projects/demo/files")).json()).toEqual({ project: "demo", asked: "demo" });
    expect(await (await request("/api/projects/other/files")).json()).toEqual({ project: "other", asked: "other" });
    expect((await request("/api/projects/closed/files")).status).toBe(404);
    expect(await (await request("/api/projects")).json()).toEqual({ projects: [{ id: "demo" }, { id: "other" }] });
    expect(await (await request("/__gateway/status")).json()).toEqual({ slugs: ["demo", "other"] });
  });

  it("injects the Framesmith layer into the Studio page and serves it", async () => {
    const { request, open } = start();
    await open("demo");
    const page = await (await request("/")).text();
    expect(page).toContain('<script src="/__framesmith/overrides.js"></script></head>');
    expect((await request("/__framesmith/overrides.css")).headers.get("content-type")).toMatch(/text\/css/);
    expect(await (await request("/__framesmith/overrides.js")).text()).toContain("hf-dock-tab");
  });

  it("leaves the desktop app hand-off out", async () => {
    const { request, open } = start();
    await open("demo");
    expect((await request("/api/open-in-desktop")).status).toBe(404);
    expect((await request("/api/open-in-desktop", { method: "POST" })).status).toBe(404);
  });

  it("merges every project's file events into one stream", async () => {
    const { request, open, studios } = start();
    await open("demo");
    await open("other");
    const response = await request("/api/events");
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    await new Promise((resolve) => setTimeout(resolve, 100));
    studios.emitters.get("demo")!("index.html");
    studios.emitters.get("other")!("scene.html");

    let received = "";
    while (!(received.includes("demo") && received.includes("other"))) received += (await reader.read()).value;
    await reader.cancel();
    expect(received).toContain('event: file-change\ndata: {"projectId":"demo","path":"index.html"}');
    expect(received).toContain('event: file-change\ndata: {"projectId":"other","path":"scene.html"}');
  });

  it("rejects bad slugs, unknown projects and missing tokens", async () => {
    const { open } = start({ token: "secret" });
    expect((await open("demo")).status).toBe(401);
    expect((await open("../etc", "secret")).status).toBe(400);
    expect((await open("missing", "secret")).status).toBe(404);
  });

  it("lets only the web app frame the studio", async () => {
    const framed = start({ frameAncestors: "https://studio.example" });
    await framed.open("demo");
    expect((await framed.request("/")).headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self' https://studio.example",
    );

    const unframed = start();
    await unframed.open("demo");
    expect((await unframed.request("/")).headers.get("content-security-policy")).toBeNull();
  });

  it("shuts every project's server down on close", async () => {
    const { gateway, open, studios } = start();
    await open("demo");
    await open("other");
    await gateway.close();
    expect(studios.shutdowns.sort()).toEqual(["demo", "other"]);
  });
});
