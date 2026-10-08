import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthConfig, AuthRole, AuthSession } from "./auth.types";

export type CookieOptions = { httpOnly: boolean; maxAge: number; path: string; sameSite: "lax"; secure: boolean };

export type SerializedSessionCookie = { name: string; value: string; options: CookieOptions };

type SessionCookieConfig = Pick<AuthConfig, "cookieName" | "secureCookies" | "sessionSecret" | "sessionTtlDays">;

/**
 * Mints, reads and clears the stateless session cookie: a signed payload with no server-side record. Revocation
 * is the account's `sessionsValidFrom`, checked on every request by `AuthService.authenticate`.
 */
export class SessionCookieCodec {
  constructor(private readonly config: SessionCookieConfig) {}

  createSession(userId: string, email: string, role: AuthRole): AuthSession {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + this.ttlMs());
    return { userId, email, role, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString() };
  }

  serialize(session: AuthSession): SerializedSessionCookie {
    const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
    return { name: this.config.cookieName, value: `${payload}.${this.sign(payload)}`, options: this.options(this.ttlMs()) };
  }

  clear(): SerializedSessionCookie {
    return { name: this.config.cookieName, value: "", options: this.options(0) };
  }

  /**
   * Reads the session out of a `Cookie` header. A leftover cookie of the same name (another path, an older secret)
   * travels alongside the current one, first: every candidate is tried, the first that verifies wins.
   */
  read(cookieHeader?: string): AuthSession | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name !== this.config.cookieName) continue;
      const session = this.verify(rest.join("="));
      if (session) return session;
    }
    return null;
  }

  private ttlMs() {
    return this.config.sessionTtlDays * 24 * 60 * 60 * 1000;
  }

  private options(maxAge: number): CookieOptions {
    return { httpOnly: true, maxAge, path: "/", sameSite: "lax", secure: this.config.secureCookies };
  }

  private verify(value: string): AuthSession | null {
    const [payload, signature] = value.split(".");
    if (!payload || !signature || !this.signatureMatches(payload, signature)) return null;
    let session: AuthSession;
    try {
      session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthSession;
    } catch {
      return null;
    }
    if (!session.userId || !session.email || !session.issuedAt || !session.expiresAt) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
    return session;
  }

  private sign(payload: string) {
    return createHmac("sha256", this.config.sessionSecret).update(payload).digest("base64url");
  }

  private signatureMatches(payload: string, signature: string) {
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
