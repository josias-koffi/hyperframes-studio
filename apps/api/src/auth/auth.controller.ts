import { Controller, Get, Inject, Query, Res, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "./auth.guard";
import { AuthService } from "./auth.service";
import { requestContext } from "./request-context";

@Public()
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /** The app's window opens here: a session for its person, then the studio. */
  @Get("desktop")
  async desktop(@Query("token") token: string | undefined, @Res() res: Response) {
    const result = await this.auth.desktopSignIn(token);
    res.cookie(result.cookie.name, result.cookie.value, result.cookie.options);
    res.redirect(302, result.redirectUrl);
  }

  @Get("session")
  session() {
    const user = requestContext.getStore()?.user;
    if (!user) throw new UnauthorizedException("Aucune session valide.");
    return { authenticated: true, user };
  }
}
