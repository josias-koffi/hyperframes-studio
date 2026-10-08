import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createGateway } from "./gateway";
import { loadCreateStudio } from "./studio-cli";

// The real Studio server of the pinned CLI: catches a HyperFrames bump that moves or changes a route the editor uses.
describe("pinned HyperFrames CLI", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "hf-cli-"));
  const close: Array<() => Promise<void>> = [];
  afterAll(async () => {
    for (const step of close) await step();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("serves the engine routes the editor relies on, in process", async () => {
    const projectDir = join(workspaceDir, "videos", "demo");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "index.html"),
      '<!doctype html><html><head></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="2" data-width="1920" data-height="1080">' +
        '<h1 id="title" class="clip" data-start="0" data-duration="2">Bonjour</h1></div></body></html>',
    );
    const gateway = createGateway({ workspaceDir, createStudio: await loadCreateStudio(), token: "" });
    close.push(() => gateway.close());
    const request = (path: string, init?: RequestInit) => gateway.app.fetch(new Request(`http://localhost${path}`, init));
    const post = (path: string, body: unknown) =>
      request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    expect((await post("/__gateway/open", { slug: "demo" })).status).toBe(200);
    expect(await (await request("/api/projects/demo")).json()).toMatchObject({ id: "demo" });

    const preview = await request("/api/projects/demo/preview");
    expect(preview.status).toBe(200);
    const html = await preview.text();
    expect(html).toContain('<base href="/api/projects/demo/preview/">');
    expect(html).toContain('src="/api/runtime.js"');
    expect((await request("/api/runtime.js")).status).toBe(200);

    const file = await request("/api/projects/demo/files/index.html");
    expect(((await file.json()) as { content: string }).content).toContain("Bonjour");
    const version = file.headers.get("etag");
    expect(version).toBeTruthy();

    const patched = await post("/api/projects/demo/file-mutations/patch-element/index.html", {
      target: { id: "title" },
      operations: [
        { type: "text-content", value: "Salut" },
        { type: "attribute", property: "start", value: "0.5" },
        { type: "inline-style", property: "color", value: "red" },
      ],
    });
    expect(await patched.json()).toMatchObject({ ok: true, changed: true });
    const source = readFileSync(join(projectDir, "index.html"), "utf8");
    expect(source).toMatch(/<h1[^>]*data-start="0.5"[^>]*>Salut<\/h1>/);
    expect(source).toMatch(/style="color: red;?"/);

    const split = await post("/api/projects/demo/file-mutations/split-element/index.html", {
      target: { id: "title" },
      splitTime: 1,
      newId: "title-2",
    });
    expect(await split.json()).toMatchObject({ ok: true, newId: "title-2" });

    const removed = await post("/api/projects/demo/file-mutations/remove-element/index.html", { target: { id: "title-2" } });
    expect(await removed.json()).toMatchObject({ ok: true, changed: true });

    const current = await request("/api/projects/demo/files/index.html");
    const restored = await request("/api/projects/demo/files/index.html", {
      method: "PUT",
      headers: { "if-match": current.headers.get("etag")! },
      body: "<!doctype html><html><body></body></html>",
    });
    expect(restored.status).toBeLessThan(300);
  }, 60_000);
});
