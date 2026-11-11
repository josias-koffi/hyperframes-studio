import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listBlocks } from "./list-blocks";

const WORKSPACE = join(__dirname, "../../../../workspace");

describe("listBlocks", () => {
  it("gives every shipped block a preview that plays its timeline, scenes before overlays", async () => {
    const cards = await listBlocks(WORKSPACE);
    expect(cards.length).toBeGreaterThan(10);
    for (const { manifest, preview } of cards) {
      expect(preview, manifest.id).toContain('window.__timelines["preview"]');
      expect(preview, manifest.id).not.toMatch(/\{\{\s*@?[a-zA-Z]/);
      expect(preview, manifest.id).not.toContain("assets/uploads/");
    }
    const kinds = cards.map((card) => card.manifest.kind);
    expect(kinds.indexOf("overlay")).toBeGreaterThan(kinds.lastIndexOf("scene"));
  });

  it("fills a captions block with sample words", async () => {
    const captions = (await listBlocks(WORKSPACE)).find((card) => card.manifest.id === "captions-karaoke")!;
    expect(captions.preview).toContain('"text":"Voici"');
  });
});
