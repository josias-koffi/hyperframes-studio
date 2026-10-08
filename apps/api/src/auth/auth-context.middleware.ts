import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { AuthService } from "./auth.service";
import { requestContext } from "./request-context";

/** Resolves the session once per request and opens the request context every later step reads it from. */
@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const store = { user: null as Awaited<ReturnType<AuthService["authenticate"]>> };
    requestContext.run(store, () => {
      this.auth.authenticate(req.headers.cookie).then((user) => {
        store.user = user;
        next();
      }, next);
    });
  }
}
