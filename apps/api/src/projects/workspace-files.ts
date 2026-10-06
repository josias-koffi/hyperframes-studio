import { resolve, sep } from "node:path";

/**
 * Resolves a file of `videos/<slug>/` for the preview routes, refusing any
 * path that escapes the video folder.
 */
export function resolveVideoFile(workspaceDir: string, slug: string, relativePath: string): string | null {
  const root = resolve(workspaceDir, "videos", slug);
  const target = resolve(root, relativePath);
  return target === root || target.startsWith(root + sep) ? target : null;
}
