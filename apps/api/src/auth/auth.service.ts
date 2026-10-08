import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { createConsentRecord, hashToken, normalizeEmail } from "./auth.helpers";
import { buildMagicLink, signedInUrl } from "./auth.links";
import type { AuthAccountStore, AuthConfig, SessionUser } from "./auth.types";
import { SessionCookieCodec } from "./session-cookie";

export const SUSPENDED_MESSAGE = "Ce compte est suspendu.";

/**
 * Passwordless sign-in (from cvforge): an e-mailed single-use link opens a signed, stateless session. Anyone may
 * sign up; the account is created by its first redeemed link.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly cookies: SessionCookieCodec;

  constructor(
    private readonly config: AuthConfig,
    private readonly store: AuthAccountStore,
  ) {
    this.cookies = new SessionCookieCodec(config);
  }

  /** A new address must accept the terms: its account is created with that consent when the link is redeemed. */
  async requestMagicLink(rawEmail: string, consentAccepted: boolean, next: string | null = null) {
    await this.pruneExpiredLinks();
    const email = normalizeEmail(rawEmail);
    if (!email) throw new BadRequestException("Saisis une adresse e-mail valide.");
    const account = await this.store.findByEmail(email);
    if (!account && !consentAccepted) throw new BadRequestException("Accepte les conditions pour créer ton compte.");
    if (account?.status === "suspended") throw new ForbiddenException(SUSPENDED_MESSAGE);

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + this.config.magicLinkTtlMinutes * 60_000);
    await this.store.saveMagicLink(hashToken(token), { email, consent: account ? null : createConsentRecord(), expiresAt });
    return {
      email,
      magicLink: buildMagicLink(this.config, token, next),
      expiresAt: expiresAt.toISOString(),
      sessionDurationDays: this.config.sessionTtlDays,
    };
  }

  async consumeMagicLink(rawToken: string | undefined, next: string | null = null) {
    await this.pruneExpiredLinks();
    const token = rawToken?.trim();
    // Redeeming deletes the link in the same write, so a double click cannot open two sessions.
    const link = token ? await this.store.consumeMagicLink(hashToken(token), new Date()) : null;
    if (!link) throw new UnauthorizedException("Ce lien de connexion est invalide ou a expiré.");
    const account = await this.store.findOrCreate(link.email, link.consent);
    if (account.status === "suspended") throw new ForbiddenException(SUSPENDED_MESSAGE);
    const session = this.cookies.createSession(account.id, account.email, account.role);
    return { redirectUrl: signedInUrl(this.config, next), session, cookie: this.cookies.serialize(session) };
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

  clearSessionCookie() {
    return this.cookies.clear();
  }

  /** Spent links are deleted on redemption; this clears the ones nobody clicked. */
  private async pruneExpiredLinks() {
    try {
      await this.store.purgeExpiredMagicLinks(new Date());
    } catch (error) {
      // Housekeeping never blocks a sign-in.
      this.logger.warn(`Could not purge expired magic links: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
