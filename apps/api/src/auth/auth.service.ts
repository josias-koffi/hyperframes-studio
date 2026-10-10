import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { AuthAccountStore, AuthConfig, SessionUser } from "./auth.types";
import { SessionCookieCodec } from "./session-cookie";

export const SUSPENDED_MESSAGE = "Ce compte est suspendu.";
const CONSENT_VERSION = "2026-10-studio";

/**
 * The app's sign-in: the window it opens hands the token drawn at launch, which opens a signed, stateless session
 * for its person. The account is created at the first launch.
 */
@Injectable()
export class AuthService {
  private readonly cookies: SessionCookieCodec;

  constructor(
    private readonly config: AuthConfig,
    private readonly store: AuthAccountStore,
  ) {
    this.cookies = new SessionCookieCodec(config);
  }

  async desktopSignIn(rawToken: string | undefined) {
    const login = this.config.desktopLogin;
    const token = Buffer.from(rawToken?.trim() ?? "");
    const expected = Buffer.from(login?.token ?? "");
    if (!login || token.length !== expected.length || !timingSafeEqual(token, expected)) {
      throw new UnauthorizedException("Ce lien de connexion est invalide ou a expiré.");
    }
    const consent = { acceptedAt: new Date().toISOString(), source: "desktop" as const, version: CONSENT_VERSION };
    const account = await this.store.findOrCreate(login.email, consent);
    if (account.status === "suspended") throw new ForbiddenException(SUSPENDED_MESSAGE);
    const session = this.cookies.createSession(account.id, account.email, account.role);
    return { redirectUrl: `${this.config.appUrl}/`, cookie: this.cookies.serialize(session) };
  }

  /**
   * The person behind a `Cookie` header: a signature that verifies is not enough, the account must still exist, be
   * active, and not have revoked the sessions issued before.
   */
  async authenticate(cookieHeader: string | undefined): Promise<SessionUser | null> {
    const session = this.cookies.read(cookieHeader);
    if (!session) return null;
    const account = await this.store.findById(session.userId);
    if (!account || account.status !== "active") return null;
    if (account.sessionsValidFrom && new Date(session.issuedAt) < account.sessionsValidFrom) return null;
    return { id: account.id, email: account.email, role: account.role };
  }
}
