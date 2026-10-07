import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createGateway } from "./gateway";
import { loadCreateStudio } from "./studio-cli";

// The real Studio server of the pinned CLI: catches a HyperFrames bump that moves or changes it.
describe("pinned HyperFrames CLI", () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "hf-cli-"));
  const close: Array<() => Promise<void>> = [];
  afterAll(async () => {
    for (const step of close) await step();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("serves a project's Studio page and API in process", async () => {
    const projectDir = join(workspaceDir, "videos", "demo");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "index.html"),
      '<!doctype html><html><body><div id="root" data-composition-id="main" data-width="1920" data-height="1080"></div></body></html>',
    );
    const gateway = createGateway({
      workspaceDir,
      createStudio: await loadCreateStudio(),
      token: "",
      overridesDir: join(__dirname, "..", "public"),
    });
    close.push(() => gateway.close());
    const request = (path: string, init?: RequestInit) => gateway.app.fetch(new Request(`http://localhost${path}`, init));

    expect((await request("/__gateway/open", { method: "POST", body: JSON.stringify({ slug: "demo" }) })).status).toBe(200);
    const page = await request("/");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("/__framesmith/overrides.js");
    const project = await request("/api/projects/demo");
    expect(project.status).toBe(200);
    expect(await project.json()).toMatchObject({ id: "demo" });
  }, 60_000);
});
