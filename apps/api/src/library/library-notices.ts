import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LIBRARY_NOTICES_FILE, libraryNoticesSchema, type LibraryNotices } from "@studio/shared";

/**
 * The legal notices of the asset library the app shipped, as `scripts/fetch-library.mjs` generated them. A library
 * without notices (not fetched yet, in development) has no pack to credit.
 */
export async function readLibraryNotices(workspaceDir: string): Promise<LibraryNotices> {
  let text: string;
  try {
    text = await readFile(join(workspaceDir, "library", LIBRARY_NOTICES_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, packs: [] };
    throw error;
  }
  return libraryNoticesSchema.parse(JSON.parse(text));
}
