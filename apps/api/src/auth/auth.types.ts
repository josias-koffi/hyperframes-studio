import type { UserConsent } from "@studio/db";

export type AuthRole = "admin" | "user";

export type AuthConfig = {
  /** `WEB_URL`: the window only knows the studio's front, which relays `/api/*` to this API. */
  appUrl: string;
  sessionTtlDays: number;
  cookieName: string;
  sessionSecret: string;
  secureCookies: boolean;
  /**
   * The app signs its person in with this token, drawn at each launch and handed by the window it opens to
   * `GET /auth/desktop`. Null: nobody can sign in.
   */
  desktopLogin: { token: string; email: string } | null;
};

export type AuthAccount = {
  id: string;
  email: string;
  role: AuthRole;
  status: "active" | "suspended";
  /** Sessions issued before this instant are refused. Null: none revoked. */
  sessionsValidFrom: Date | null;
};

/** What the signed cookie carries. */
export type AuthSession = { userId: string; email: string; role: AuthRole; issuedAt: string; expiresAt: string };

/** The person behind a request, once the cookie verified and the account is still allowed in. */
export type SessionUser = { id: string; email: string; role: AuthRole };

export const AUTH_ACCOUNT_STORE = Symbol("AUTH_ACCOUNT_STORE");

export type AuthAccountStore = {
  findById: (id: string) => Promise<AuthAccount | null>;
  /** The account of this address, created on its first sign-in. The very first account becomes admin. */
  findOrCreate: (email: string, consent: UserConsent | null) => Promise<AuthAccount>;
};
