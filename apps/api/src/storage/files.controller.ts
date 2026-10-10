import { Controller, ForbiddenException, Get, Inject, NotFoundException, Put, Query, Req, Res } from "@nestjs/common";
import type { FileOperation, Storage } from "@studio/storage";
import type { Request, Response } from "express";
import { Public } from "../auth/auth.guard";
import { STORAGE } from "./storage.token";

type SignedQuery = { op?: string; expires?: string; signature?: string };

/**
 * The presigned URLs of the storage: uploads from the browser, media and renders it reads. The signature is the
 * only access check: no session cookie reaches a PUT from the front's origin.
 */
@Public()
@Controller("files")
export class FilesController {
  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  @Get("*key")
  download(@Req() req: Request, @Query() query: SignedQuery, @Res() res: Response) {
    const { path } = this.signed("get", req, query);
    res.sendFile(path, { dotfiles: "allow" }, (error) => {
      if (error && !res.headersSent) res.status(404).end();
    });
  }

  @Put("*key")
  async upload(@Req() req: Request, @Query() query: SignedQuery) {
    const { key } = this.signed("put", req, query);
    await this.storage.files.write(key, req);
    return { ok: true };
  }

  private signed(operation: FileOperation, req: Request, query: SignedQuery) {
    const files = this.storage.files;
    const raw = (req.params as Record<string, string | string[]>).key;
    const key = Array.isArray(raw) ? raw.join("/") : raw;
    const path = files.pathOf(key);
    if (!path) throw new NotFoundException();
    if (query.op !== operation || !files.verify(operation, key, query)) throw new ForbiddenException("Lien expiré ou invalide.");
    return { key, path };
  }
}
