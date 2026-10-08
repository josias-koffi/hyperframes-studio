import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

/** One page per PNG, each page the size of its image: the document a LinkedIn carousel is posted as. */
export async function assemblePdf(pngPaths: string[], outFile: string, title?: string): Promise<void> {
  const pdf = await PDFDocument.create();
  if (title) pdf.setTitle(title);
  for (const path of pngPaths) {
    const image = await pdf.embedPng(await readFile(path));
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  await writeFile(outFile, await pdf.save());
}
