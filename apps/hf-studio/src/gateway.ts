import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import type { CreateStudio, StudioServer } from "./studio-cli";

export type GatewayConfig = {
  workspaceDir: string;
  /** Builds one project's Studio server (`loadCreateStudio()`, a fake in tests). */
  createStudio: CreateStudio;
  /** Shared secret the API sends on every call; empty disables the check (local dev). */
  token: string;
  /** How the gateway reaches itself (`127.0.0.1:<port>`), for the Studio's thumbnail browser. */
  internalHost?: string;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * The HyperFrames engine behind Framesmith's own editor, in process: no Studio page is served, only the API of
 * every opened project (playable preview, file reads and writes, element mutations, thumbnails, waveforms).
 *
 * Each project gets the CLI's own Studio server (`createStudioServer`, what `hyperframes preview` runs), reached
 * at `/api/projects/<slug>/…`. Only the Framesmith API calls the gateway, which stays on the internal network.
 */
export function createGateway(config: GatewayConfig) {
  const studios = new Map<string, StudioServer>();

  function open(slug: string) {
    if (studios.has(slug)) return;
    const projectDir = join(config.workspaceDir, "videos", slug);
    if (!existsSync(projectDir)) throw Object.assign(new Error(`Projet introuvable : videos/${slug}`), { status: 404 });
    // Edit history (the Studio's file backups) next to the projects, so it outlives a redeploy.
    const historyRoot = join(config.workspaceDir, ".studio-history");
    studios.set(slug, config.createStudio({ projectDir, projectName: slug, historyRoot }));
  }

  const app = new Hono();

  app.get("/__gateway/status", (c) => c.json({ slugs: [...studios.keys()] }));

  if (config.token) {
    app.use("*", async (c, next) => {
      if (c.req.header("authorization") !== `Bearer ${config.token}`) return c.json({ message: "unauthorized" }, 401);
      await next();
    });
  }

  app.post("/__gateway/open", async (c) => {
    const slug = ((await c.req.json().catch(() => ({}))) as { slug?: unknown }).slug;
    if (typeof slug !== "string" || !SLUG.test(slug)) return c.json({ message: "slug invalide" }, 400);
    try {
      open(slug);
      return c.json({ slug });
    } catch (error) {
      const status = (error as { status?: number }).status === 404 ? 404 : 500;
      return c.json({ message: (error as Error).message }, status);
    }
  });

  // The preview runtime, the same for every project: the one script a preview page loads by absolute path.
  app.get("/api/runtime.js", (c) => {
    const [first] = studios.values();
    if (!first) return c.json({ error: "Aucun projet ouvert." }, 503);
    return first.app.fetch(c.req.raw);
  });

  app.all("/api/projects/:slug/*", (c) => routeToProject(c));
  app.all("/api/projects/:slug", (c) => routeToProject(c));

  function routeToProject(c: Context) {
    const studio = studios.get(c.req.param("slug") ?? "");
    if (!studio) return c.json({ error: "Projet non ouvert : rouvre l'éditeur depuis Framesmith." }, 404);
    // A thumbnail is shot by a headless Chrome next to the server, sent to `http://<Host>/…`: the caller's host is
    // not reachable from inside the container, the gateway's own address is.
    if (config.internalHost && /^\/api\/projects\/[^/]+\/(image-)?thumbnail\//.test(c.req.path)) {
      const headers = new Headers(c.req.raw.headers);
      headers.set("host", config.internalHost);
      return studio.app.fetch(new Request(c.req.raw, { headers }));
    }
    return studio.app.fetch(c.req.raw);
  }

  app.all("*", (c) => c.json({ error: "not found" }, 404));

  return {
    app,
    async close() {
      const running = [...studios.values()];
      studios.clear();
      await Promise.allSettled(running.map((server) => server.shutdown()));
    },
  };
}
