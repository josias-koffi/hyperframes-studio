import { spawn, type ChildProcess } from "node:child_process";
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import httpProxy from "http-proxy";

export type GatewayConfig = {
  workspaceDir: string;
  /** The HyperFrames CLI, possibly with a prefix (`npx --yes hyperframes@0.8.134`). */
  hyperframes: string[];
  /** Loopback port of the one `hyperframes preview` this gateway runs. */
  previewPort: number;
  /** Shared secret the API sends on control calls; empty disables the check (local dev). */
  token: string;
  /** How long a preview may take to answer after spawning (npx may download the CLI first). */
  readyTimeoutMs: number;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const CONTROL = "/__gateway/";

/**
 * Runs the HyperFrames Studio (`hyperframes preview`) of one project at a time and exposes it.
 * The Studio only listens on 127.0.0.1 and serves its files from `/`, so it gets a whole host (or port) to
 * itself: everything but `/__gateway/*` is proxied to it, WebSockets included.
 */
export function createGateway(config: GatewayConfig) {
  let current: { slug: string; child: ChildProcess } | null = null;
  const target = `http://127.0.0.1:${config.previewPort}`;
  const proxy = httpProxy.createProxyServer({ target, ws: true, xfwd: true });
  proxy.on("error", (_error, _req, res) => {
    if ("writeHead" in res && !res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("Le Studio HyperFrames ne répond pas. Rouvre-le depuis le projet.");
    }
  });

  function stop(): Promise<void> {
    const running = current;
    current = null;
    if (!running || running.child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      running.child.once("exit", () => resolve());
      // The CLI spawns its own server: kill the whole process group.
      try {
        process.kill(-running.child.pid!, "SIGTERM");
      } catch {
        running.child.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-running.child.pid!, "SIGKILL");
        } catch {
          /* already gone */
        }
      }, 5000).unref();
    });
  }

  function answers(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = request(`${target}/`, { method: "GET", timeout: 2000 }, (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => req.destroy());
      req.end();
    });
  }

  async function open(slug: string): Promise<void> {
    if (current?.slug === slug && current.child.exitCode === null && (await answers())) return;
    await stop();
    const [bin, ...prefix] = config.hyperframes;
    const child = spawn(
      bin,
      [...prefix, "preview", `videos/${slug}`, "--foreground", "--no-open", "--force-new", `--port=${config.previewPort}`],
      { cwd: config.workspaceDir, detached: true, stdio: ["ignore", "inherit", "inherit"] },
    );
    current = { slug, child };
    const deadline = Date.now() + config.readyTimeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`hyperframes preview s'est arrêté (code ${child.exitCode})`);
      if (await answers()) return;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await stop();
    throw new Error("Le Studio HyperFrames n'a pas démarré à temps");
  }

  function json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  async function control(req: IncomingMessage, res: ServerResponse) {
    const action = req.url!.slice(CONTROL.length).split("?")[0];
    if (action === "status" && req.method === "GET") return json(res, 200, { slug: current?.slug ?? null });
    if (config.token && req.headers.authorization !== `Bearer ${config.token}`) return json(res, 401, { message: "unauthorized" });
    if (action === "open" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const slug = (JSON.parse(raw || "{}") as { slug?: unknown }).slug;
      if (typeof slug !== "string" || !SLUG.test(slug)) return json(res, 400, { message: "slug invalide" });
      try {
        await open(slug);
        return json(res, 200, { slug });
      } catch (error) {
        return json(res, 503, { message: (error as Error).message });
      }
    }
    return json(res, 404, { message: "not found" });
  }

  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith(CONTROL)) {
      control(req, res).catch((error) => json(res, 500, { message: (error as Error).message }));
      return;
    }
    if (!current) {
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      res.end("Aucun projet ouvert : utilise « Ouvrir dans le Studio HyperFrames » depuis le studio.");
      return;
    }
    proxy.web(req, res);
  });
  server.on("upgrade", (req, socket, head) => {
    if (!current) return socket.destroy();
    proxy.ws(req, socket, head);
  });

  return {
    server,
    open,
    async close() {
      await stop();
      proxy.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
