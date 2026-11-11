import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBlocks } from "@studio/shared";
import { describe, expect, it } from "vitest";
import { blockFromTemplate, templateScenes } from "./template-blocks";

const SHIPPED = join(__dirname, "../../../../workspace/blocks");

const scene = `<template>
  <div id="card" data-composition-id="card" data-width="1080" data-height="1920">
    <h2 id="title" data-var-text="headline" data-label="Titre">Soldes</h2>
    <p id="tag" style="color: var(--accent)" data-label="Étiquette">-30 %</p>
    <img id="icon" src="assets/library/star.svg" alt="" data-label="Icône" />
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.from("#title", { opacity: 0, duration: 0.5 }, 0);
    window.__timelines["card"] = tl;
  </script>
</template>`;

const index = `<!doctype html><html><head></head><body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="7" data-width="1080" data-height="1920">
    <div id="el-1" class="clip" data-composition-id="card" data-composition-src="compositions/card.html" data-start="0" data-duration="4.5" data-label="Carte promo"></div>
  </div>
  <script>const tl = gsap.timeline({ paused: true }); window.__timelines["main"] = tl;</script>
</body></html>`;

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), "template-blocks-"));
  await symlink(SHIPPED, join(dir, "blocks"));
  const video = join(dir, "videos", "promo");
  await mkdir(join(video, "compositions"), { recursive: true });
  await writeFile(join(video, "index.html"), index);
  await writeFile(join(video, "compositions/card.html"), scene);
  await mkdir(join(video, "assets/library"), { recursive: true });
  await writeFile(join(video, "assets/library/star.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(
    join(video, "VARIABLES.json"),
    JSON.stringify([
      { id: "headline", label: "Titre", type: "string", default: "Soldes" },
      { id: "accent", label: "Accent", type: "color", default: "#E11D48" },
    ]),
  );
  return { dir, video };
}

const body = { scene: "compositions/card.html", id: "carte-promo", name: "Carte promo", description: "Un titre et une étiquette.", useWhen: "Pour une promotion." };

describe("blockFromTemplate", () => {
  it("lists the template's scenes, its sub-compositions then the whole root", async () => {
    const { video } = await workspace();
    expect(await templateScenes(video)).toEqual([
      { path: "compositions/card.html", label: "Carte promo", duration: 4.5 },
      { path: "index.html", label: "Toute la composition", duration: 7 },
    ]);
  });

  it("saves the block in blocks-user once check passes, and the workspace loads it with the shipped ones", async () => {
    const { dir, video } = await workspace();
    const checked: string[] = [];
    const result = await blockFromTemplate(dir, video, body, { check: async (_ws, _tpl, block) => (checked.push(block.manifest.id), null) });
    expect(result).toMatchObject({ manifest: { id: "carte-promo", duration: { default: 4.5 }, example: { headline: "Soldes", accent: "#E11D48" } } });
    expect(checked).toEqual(["carte-promo"]);
    const saved = await readFile(join(dir, "blocks-user/carte-promo/block.html"), "utf8");
    expect(saved).toContain("{{headline}}");
    // The template's icon travels inside the block: the videos that use it do not have the file.
    expect(saved).toContain('src="data:image/svg+xml;base64,');
    expect(saved).not.toContain("assets/library/star.svg");
    const { blocks } = await loadBlocks(dir);
    expect(blocks.has("carte-promo")).toBe(true);
    expect(blocks.has("hook-kinetic")).toBe(true);
    // The same id twice is refused.
    expect(await blockFromTemplate(dir, video, body, { check: async () => null })).toEqual({ errors: ["un bloc porte déjà l'id « carte-promo »"] });
  });

  it("saves nothing when check fails", async () => {
    const { dir, video } = await workspace();
    const result = await blockFromTemplate(dir, video, body, { check: async () => "✗ text_overflow #scene-s1-title" });
    expect(result).toEqual({ errors: ["le bloc ne passe pas check :\n✗ text_overflow #scene-s1-title"] });
    expect((await loadBlocks(dir)).blocks.has("carte-promo")).toBe(false);
  });
});
