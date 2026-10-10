import type { UserConsent } from "@studio/db";

export type AuthRole = "admin" | "user";

export type AuthConfig = {
  /** `WEB_URL`: the browser only knows the studio, which relays `/api/*` to this API. */
  appUrl: string;
  magicLinkTtlMinutes: number;
  sessionTtlDays: number;
  cookieName: string;
  sessionSecret: string;
  secureCookies: boolean;
  /**
   * The desktop app signs its one person in without an e-mail: the window it opens hands this token, drawn at each
   * start, to `GET /auth/desktop`. Absent on the servers.
   */
  desktopLogin?: { token: string; email: string } | null;
};

export type AuthAccount = {
  id: string;
  email: string;
  role: AuthRole;
  status: "active" | "suspended";
  /** Sessions issued before this instant are refused. Null: none revoked. */
  sessionsValidFrom: Date | null;
};

/** A pending link. Only unspent links exist: redeeming one deletes it. */
export type AuthMagicLink = { email: string; consent: UserConsent | null; expiresAt: Date };

/** What the signed cookie carries. */
export type AuthSession = { userId: string; email: string; role: AuthRole; issuedAt: string; expiresAt: string };

/** The person behind a request, once the cookie verified and the account is still allowed in. */
export type SessionUser = { id: string; email: string; role: AuthRole };

export const AUTH_ACCOUNT_STORE = Symbol("AUTH_ACCOUNT_STORE");

export type AuthAccountStore = {
  findByEmail: (email: string) => Promise<AuthAccount | null>;
  findById: (id: string) => Promise<AuthAccount | null>;
  /** The account of this address, created on its first sign-in. The very first account becomes admin. */
  findOrCreate: (email: string, consent: UserConsent | null) => Promise<AuthAccount>;
  saveMagicLink: (tokenHash: string, link: AuthMagicLink) => Promise<void>;
  /**
   * Redeems a link and removes it in one write, so two simultaneous clicks on the same link cannot both open a
   * session. Null when the link is unknown or expired.
   */
  consumeMagicLink: (tokenHash: string, now: Date) => Promise<AuthMagicLink | null>;
  /** Drops links nobody can use any more. */
  purgeExpiredMagicLinks: (now: Date) => Promise<number>;
};
