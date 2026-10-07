import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** One project's Studio server, as `hyperframes preview` builds it: a fetch handler plus its shutdown. */
export type StudioServer = {
  app: { fetch(request: Request): Response | Promise<Response> };
  shutdown(): Promise<void>;
};

export type CreateStudio = (project: { projectDir: string; projectName: string; historyRoot: string }) => StudioServer;

/**
 * `createStudioServer` of the pinned HyperFrames CLI (package.json): the very server `hyperframes preview` runs
 * (Studio UI, API, thumbnails, fonts…), built in process instead of spawned. The CLI does not export it, so it is
 * read from its hashed chunk; a version bump that renames or removes it fails here, loudly, at startup.
 */
export async function loadCreateStudio(cliDist = join(dirname(require.resolve("hyperframes/package.json")), "dist")) {
  const chunks = readdirSync(cliDist).filter((name) => /^studioServer-[\w-]+\.js$/.test(name));
  if (chunks.length !== 1) {
    throw new Error(`hyperframes CLI: expected one studioServer chunk in ${cliDist}, found ${chunks.length}`);
  }
  const module = (await import(pathToFileURL(join(cliDist, chunks[0])).href)) as { createStudioServer?: unknown };
  if (typeof module.createStudioServer !== "function") {
    throw new Error(`hyperframes CLI: ${chunks[0]} no longer exports createStudioServer`);
  }
  return module.createStudioServer as CreateStudio;
}
