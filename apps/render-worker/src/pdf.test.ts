import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assemblePdf } from "./pdf";

// A 1×1 opaque PNG.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("assemblePdf", () => {
  it("makes one page per slide, at the size of the slide", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdf-"));
    const slides = [join(dir, "slide-01.png"), join(dir, "slide-02.png")];
    for (const slide of slides) await writeFile(slide, PIXEL);

    await assemblePdf(slides, join(dir, "out.pdf"), "demo");

    const pdf = await PDFDocument.load(await readFile(join(dir, "out.pdf")));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 1, height: 1 });
  });
});
