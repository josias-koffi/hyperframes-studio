import { Body, Controller, Get, HttpException, HttpStatus, Inject, Post, Query, Res, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { ZodPipe } from "../shared/zod.pipe";
import { AuthMailerService } from "./auth-mailer.service";
import { Public } from "./auth.guard";
import { normalizeEmail } from "./auth.helpers";
import { failedLinkUrl } from "./auth.links";
import { AuthService } from "./auth.service";
import { AUTH_CONFIG } from "./auth.tokens";
import type { AuthConfig } from "./auth.types";
import { RateLimiter } from "./rate-limiter";
import { requestContext } from "./request-context";

const requestSchema = z.object({
  email: z.string().max(254),
  consentAccepted: z.boolean().default(false),
  next: z.string().max(500).optional(),
});

const FIFTEEN_MINUTES = 15 * 60_000;

@Public()
@Controller("auth")
export class AuthController {
  /**
   * Per address: a few links, then wait. Overall: a ceiling no real sign-in rush reaches. No per-IP counter: behind
   * the studio's relay and two proxies, the client address is not one the API can trust.
   */
  private readonly perEmail = new RateLimiter(5, FIFTEEN_MINUTES);
  private readonly overall = new RateLimiter(300, FIFTEEN_MINUTES);

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthMailerService) private readonly mailer: AuthMailerService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post("passwordless/request")
  async requestMagicLink(@Body(new ZodPipe(requestSchema)) body: z.infer<typeof requestSchema>) {
    const email = normalizeEmail(body.email);
    if (!this.overall.hit("all") || (email && !this.perEmail.hit(email))) {
      throw new HttpException("Trop de demandes de lien : réessaie dans quelques minutes.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const result = await this.auth.requestMagicLink(body.email, body.consentAccepted, body.next ?? null);
    await this.mailer.sendMagicLinkEmail(result.email, result);
    return { email: result.email, expiresAt: result.expiresAt, sessionDurationDays: result.sessionDurationDays };
  }

  /** The link of the e-mail: sets the session cookie and opens the studio, or the sign-in page saying why not. */
  @Get("passwordless/consume")
  async consumeMagicLink(@Query("token") token: string | undefined, @Query("next") next: string | undefined, @Res() res: Response) {
    try {
      const result = await this.auth.consumeMagicLink(token, next ?? null);
      res.cookie(result.cookie.name, result.cookie.value, result.cookie.options);
      res.redirect(302, result.redirectUrl);
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;
      res.redirect(302, failedLinkUrl(this.config));
    }
  }

  /** The desktop app's window opens here: a session for its one person, then the studio. */
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

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    const cookie = this.auth.clearSessionCookie();
    res.cookie(cookie.name, cookie.value, cookie.options);
    return { authenticated: false };
  }
}
