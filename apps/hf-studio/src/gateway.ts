import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { CreateStudio, StudioServer } from "./studio-cli";

export type GatewayConfig = {
  workspaceDir: string;
  /** Builds one project's Studio server (`loadCreateStudio()`, a fake in tests). */
  createStudio: CreateStudio;
  /** Shared secret the API sends on control calls; empty disables the check (local dev). */
  token: string;
  /** Origins allowed to frame the Studio (the web app), as a CSP `frame-ancestors` list; empty sends no policy. */
  frameAncestors?: string;
  /** Holds `overrides.css` and `overrides.js`, the Framesmith layer injected into the Studio page. */
  overridesDir: string;
  /** How the gateway reaches itself (`127.0.0.1:<port>`), for the Studio's thumbnail browser. */
  internalHost?: string;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const OVERRIDES = '<link rel="stylesheet" href="/__framesmith/overrides.css" /><script src="/__framesmith/overrides.js"></script>';

type StudioEvent = { event: string; data: string };

/**
 * Serves the HyperFrames Studio of every opened project from one origin, in process.
 *
 * Each project gets the CLI's own Studio server (`createStudioServer`, what `hyperframes preview` runs). The Studio
 * page picks its project from the URL hash (`#project/<slug>`) and calls `/api/projects/<slug>/…`, so those requests
 * go to that project's server; the page, its assets and the project-less routes are the same for all of them.
 * `/api/events` is one stream per page for every project: their events are merged, the page drops other projects'.
 */
export function createGateway(config: GatewayConfig) {
  const studios = new Map<string, { server: StudioServer; follow: AbortController }>();
  let latest: StudioServer | null = null;
  const subscribers = new Set<(event: StudioEvent) => void>();

  /** Relays one project's `/api/events` stream to every page connected to the gateway. */
  function follow(server: StudioServer) {
    const abort = new AbortController();
    (async () => {
      const response = await server.app.fetch(new Request("http://studio/api/events", { signal: abort.signal }));
      if (!response.body) return;
      let buffer = "";
      for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
        buffer += chunk.replace(/\r\n?/g, "\n");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end).split("\n");
          buffer = buffer.slice(end + 2);
          const field = (name: string) =>
            block.filter((line) => line.startsWith(`${name}:`)).map((line) => line.slice(name.length + 1).replace(/^ /, ""));
          const [event] = field("event");
          if (event) for (const notify of subscribers) notify({ event, data: field("data").join("\n") });
        }
      }
    })().catch(() => {
      /* closed with its project, or the project's server went away: the page reconnects */
    });
    return abort;
  }

  function open(slug: string) {
    const known = studios.get(slug);
    if (known) {
      latest = known.server;
      return;
    }
    const projectDir = join(config.workspaceDir, "videos", slug);
    if (!existsSync(projectDir)) throw Object.assign(new Error(`Projet introuvable : videos/${slug}`), { status: 404 });
    // Edit history (the Studio's undo across sessions) next to the projects, so it outlives a redeploy.
    const historyRoot = join(config.workspaceDir, ".studio-history");
    const server = config.createStudio({ projectDir, projectName: slug, historyRoot });
    studios.set(slug, { server, follow: follow(server) });
    latest = server;
  }

  /** Forwards to a project's server; HTML pages get the Framesmith layer. */
  async function forward(c: Context, server: StudioServer, request: Request = c.req.raw) {
    const response = await server.app.fetch(request);
    if (!response.headers.get("content-type")?.startsWith("text/html")) return response;
    const html = (await response.text()).replace("</head>", `${OVERRIDES}</head>`);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(html, { status: response.status, headers });
  }

  const app = new Hono();

  if (config.frameAncestors) {
    app.use(async (c, next) => {
      await next();
      // A copy: a forwarded response's headers may be immutable.
      c.res = new Response(c.res.body, c.res);
      c.res.headers.delete("x-frame-options");
      c.res.headers.set("content-security-policy", `frame-ancestors 'self' ${config.frameAncestors}`);
    });
  }

  app.get("/__gateway/status", (c) => c.json({ slugs: [...studios.keys()] }));

  app.post("/__gateway/open", async (c) => {
    if (config.token && c.req.header("authorization") !== `Bearer ${config.token}`) {
      return c.json({ message: "unauthorized" }, 401);
    }
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

  for (const file of ["overrides.css", "overrides.js"]) {
    const type = file.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8";
    app.get(`/__framesmith/${file}`, (c) =>
      c.body(readFileSync(join(config.overridesDir, file), "utf8"), 200, { "content-type": type, "cache-control": "no-cache" }),
    );
  }

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const notify = (event: StudioEvent) => void stream.writeSSE(event).catch(() => {});
      subscribers.add(notify);
      stream.onAbort(() => {
        subscribers.delete(notify);
      });
      try {
        while (!stream.aborted) await stream.sleep(30_000);
      } finally {
        subscribers.delete(notify);
      }
    }),
  );

  // The fallback project list, used when the hash names nothing: every opened project.
  app.get("/api/projects", async (c) => {
    const lists = await Promise.all(
      [...studios.values()].map(async ({ server }) => {
        const response = await server.app.fetch(new Request("http://studio/api/projects"));
        return response.ok ? (((await response.json()) as { projects?: unknown[] }).projects ?? []) : [];
      }),
    );
    return c.json({ projects: lists.flat() });
  });

  // "Edit with Framey" hands the project to HeyGen's desktop app, which a server has no use for: without this
  // route the Studio leaves the button out.
  app.all("/api/open-in-desktop", (c) => c.json({ error: "not available" }, 404));

  app.all("/api/projects/:slug/*", (c) => routeToProject(c));
  app.all("/api/projects/:slug", (c) => routeToProject(c));

  function routeToProject(c: Context) {
    const studio = studios.get(c.req.param("slug") ?? "");
    if (!studio) return c.json({ error: "Projet non ouvert : rouvre le Studio depuis Framesmith." }, 404);
    // A thumbnail is shot by a headless Chrome next to the server, sent to `http://<Host>/…`: the public host is
    // not reachable from inside the container, the gateway's own address is.
    if (config.internalHost && /^\/api\/projects\/[^/]+\/thumbnail\//.test(c.req.path)) {
      const headers = new Headers(c.req.raw.headers);
      headers.set("host", config.internalHost);
      return forward(c, studio.server, new Request(c.req.raw, { headers }));
    }
    return forward(c, studio.server);
  }

  app.all("*", (c) => {
    if (!latest) {
      return c.text("Aucun projet ouvert : utilise « Ouvrir dans le Studio HyperFrames » depuis Framesmith.", 503);
    }
    return forward(c, latest);
  });

  return {
    app,
    async close() {
      const running = [...studios.values()];
      studios.clear();
      latest = null;
      for (const { follow } of running) follow.abort();
      await Promise.allSettled(running.map(({ server }) => server.shutdown()));
    },
  };
}
