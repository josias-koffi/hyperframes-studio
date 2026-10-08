import { All, Body, Controller, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, Res } from "@nestjs/common";
import { SLIDE_COUNT } from "@studio/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { CreationsService } from "../creations/creations.service";
import { ZodPipe } from "../shared/zod.pipe";
import { engineRoute, rewritePreview } from "./engine-routes";
import { EditorService, engineBase, engineHeaders, type EditRequest } from "./editor.service";

const editRequestSchema = z.object({ text: z.string().trim().min(1).max(4000), context: z.string().max(1000).optional() });
const slideCountSchema = z.object({ slideCount: z.number().int().min(1).max(SLIDE_COUNT.max) });

const REQUEST_HEADERS = ["content-type", "range", "if-match", "if-none-match", "accept"];
const RESPONSE_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "cache-control", "last-modified"];

async function rawBody(req: Request): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  // JSON was parsed by the body parser; anything else (a file written whole) is still the raw stream.
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) && Object.keys(req.body as object).length > 0) {
    return new TextEncoder().encode(JSON.stringify(req.body));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return new Uint8Array(Buffer.concat(chunks));
}

@Controller("creations")
export class EditorController {
  constructor(
    @Inject(EditorService) private readonly editor: EditorService,
    @Inject(CreationsService) private readonly creations: CreationsService,
  ) {}

  @Post(":id/editor/open")
  open(@Param("id", ParseUUIDPipe) id: string) {
    return this.editor.open(id);
  }

  @Post(":id/editor/assets/:assetId")
  importAsset(@Param("id", ParseUUIDPipe) id: string, @Param("assetId", ParseUUIDPipe) assetId: string) {
    return this.editor.importAsset(id, assetId);
  }

  @Post(":id/editor/checkpoint")
  checkpoint(@Param("id", ParseUUIDPipe) id: string) {
    return this.editor.checkpoint(id);
  }

  @Put(":id/editor/slide-count")
  slideCount(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(slideCountSchema)) body: z.infer<typeof slideCountSchema>) {
    return this.editor.setSlideCount(id, body.slideCount);
  }

  @Post(":id/edit-request")
  editRequest(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(editRequestSchema)) body: EditRequest) {
    return this.editor.editRequest(id, body);
  }

  /**
   * The engine, seen from the editor: an allowlist of its routes for this création's folder, writes refused while
   * Claude holds it. A preview page is rewritten to load everything through here, from the editor's own origin.
   */
  @All(":id/engine/*path")
  async engine(@Param("id", ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const raw = (req.params as Record<string, string | string[]>).path;
    const path = (Array.isArray(raw) ? raw.join("/") : raw).replace(/^\/+/, "");
    const creation = await this.editor.engineTarget(id);
    const route = engineRoute(req.method, path, creation.slug);
    if (!route) throw new NotFoundException();
    if (route.writes) await this.editor.assertWritable(id);

    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const headers: Record<string, string> = { ...engineHeaders() };
    for (const name of REQUEST_HEADERS) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const body = await rawBody(req);
    const call = () => fetch(`${engineBase()}${route.upstream}${query}`, { method: req.method, headers, body });
    let upstream = await call().catch(() => null);
    // The engine forgets its projects when it restarts: open this one again, once.
    if (upstream?.status === 404 && route.upstream.startsWith("/api/projects/")) {
      const text = await upstream.clone().text();
      if (text.includes("Projet non ouvert")) {
        await this.editor.openInEngine(creation);
        upstream = await call().catch(() => null);
      }
    }
    if (!upstream) {
      res.status(502).json({ message: "Le moteur HyperFrames (hf-studio) est injoignable." });
      return;
    }

    res.status(upstream.status);
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    // The runtime (half a megabyte) is the same for every preview until the engine is upgraded.
    if (path === "runtime.js" && upstream.ok) res.setHeader("cache-control", "public, max-age=3600");
    const prefix = typeof req.headers["x-forwarded-prefix"] === "string" ? req.headers["x-forwarded-prefix"].replace(/\/+$/, "") : "";
    if (upstream.headers.get("content-type")?.startsWith("text/html") && path.startsWith("preview")) {
      const html = rewritePreview(await upstream.text(), creation.slug, `${prefix}/creations/${id}/engine`);
      res.removeHeader("content-length");
      res.removeHeader("etag");
      res.send(html);
      return;
    }
    if (!upstream.body) {
      res.end();
      return;
    }
    const reader = upstream.body.getReader();
    req.on("close", () => void reader.cancel().catch(() => {}));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  }
}
