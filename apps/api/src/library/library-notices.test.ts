import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLibraryNotices } from "./library-notices";

describe("readLibraryNotices", () => {
  it("reads the notices generated next to the catalog", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "notices-"));
    await mkdir(join(workspace, "library"));
    const packs = [{ pack: "flags", license: "MIT", assets: 2, authors: ["Lipis"], sources: ["https://github.com/lipis/flag-icons"], text: "MIT License" }];
    await writeFile(join(workspace, "library", "notices.json"), JSON.stringify({ version: 1, packs }));
    expect(await readLibraryNotices(workspace)).toEqual({ version: 1, packs });
  });

  it("has no pack to credit when the library was not fetched", async () => {
    expect(await readLibraryNotices(await mkdtemp(join(tmpdir(), "notices-")))).toEqual({ version: 1, packs: [] });
  });

  it("refuses notices that are not well formed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "notices-"));
    await mkdir(join(workspace, "library"));
    await writeFile(join(workspace, "library", "notices.json"), JSON.stringify({ version: 1, packs: [{ pack: "x", license: "GPL-3.0" }] }));
    await expect(readLibraryNotices(workspace)).rejects.toThrow();
  });
});
