import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createGateway } from "./gateway";
import type { CreateStudio } from "./studio-cli";

/** Stand-in for the CLI's Studio server: the project's API and the preview runtime. */
function fakeStudios() {
  const shutdowns: string[] = [];
  const createStudio: CreateStudio = ({ projectName }) => {
    const app = new Hono();
    app.get("/", (c) => c.html(`<html><head><title>${projectName}</title></head><body></body></html>`));
    app.get("/api/runtime.js", (c) => c.body("/* runtime */", 200, { "content-type": "text/javascript" }));
    app.get("/api/projects/:id/files", (c) => c.json({ project: projectName, asked: c.req.param("id") }));
    app.get("/api/projects/:id/thumbnail/*", (c) => c.json({ host: c.req.header("host") }));
    return {
      app,
      async shutdown() {
        shutdowns.push(projectName);
      },
    };
  };
  return { createStudio, shutdowns };
}

describe("hf-studio gateway", () => {
  const cleanups: Array<() => unknown> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  function start({ token = "", internalHost = "127.0.0.1:3000" } = {}) {
    const workspaceDir = mkdtempSync(join(tmpdir(), "hf-gateway-"));
    for (const slug of ["demo", "other"]) mkdirSync(join(workspaceDir, "videos", slug), { recursive: true });
    const studios = fakeStudios();
    const gateway = createGateway({ workspaceDir, createStudio: studios.createStudio, token, internalHost });
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

  it("keeps every opened project and routes its API to it", async () => {
    const { request, open } = start();
    expect((await open("demo")).status).toBe(200);
    expect((await open("other")).status).toBe(200);

    expect(await (await request("/api/projects/demo/files")).json()).toEqual({ project: "demo", asked: "demo" });
    expect(await (await request("/api/projects/other/files")).json()).toEqual({ project: "other", asked: "other" });
    expect((await request("/api/projects/closed/files")).status).toBe(404);
    expect(await (await request("/__gateway/status")).json()).toEqual({ slugs: ["demo", "other"] });
  });

  it("serves no Studio page, only the engine API and the preview runtime", async () => {
    const { request, open } = start();
    expect((await request("/api/runtime.js")).status).toBe(503);
    await open("demo");
    expect((await request("/")).status).toBe(404);
    expect(await (await request("/api/runtime.js")).text()).toBe("/* runtime */");
  });

  it("points the thumbnail browser at the gateway itself, not the caller's host", async () => {
    const { request, open } = start();
    await open("demo");
    const headers = { host: "api.internal" };
    expect(await (await request("/api/projects/demo/thumbnail/index.html", { headers })).json()).toEqual({
      host: "127.0.0.1:3000",
    });
  });

  it("rejects bad slugs, unknown projects and missing tokens", async () => {
    const { open, request } = start({ token: "secret" });
    expect((await open("demo")).status).toBe(401);
    expect((await open("../etc", "secret")).status).toBe(400);
    expect((await open("missing", "secret")).status).toBe(404);
    expect((await open("demo", "secret")).status).toBe(200);
    expect((await request("/api/projects/demo/files")).status).toBe(401);
    expect((await request("/api/projects/demo/files", { headers: { authorization: "Bearer secret" } })).status).toBe(200);
  });

  it("shuts every project's server down on close", async () => {
    const { gateway, open, studios } = start();
    await open("demo");
    await open("other");
    await gateway.close();
    expect(studios.shutdowns.sort()).toEqual(["demo", "other"]);
  });
});
