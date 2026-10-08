import type { AuthConfig } from "./auth.types";

type LinkConfig = Pick<AuthConfig, "appUrl">;

/** A path of the studio to open after signing in, or null: never another origin, never `//host`. */
export function safeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next.startsWith("/login") || next.startsWith("/api/") ? null : next;
}

/**
 * The link sent by e-mail. It opens the studio, whose `/api` relays it to this API: the session cookie is then
 * set on the studio's own origin, where every later request carries it.
 */
export function buildMagicLink(config: LinkConfig, token: string, next: string | null = null) {
  const url = new URL("/api/auth/passwordless/consume", config.appUrl);
  url.searchParams.set("token", token);
  const path = safeNextPath(next);
  if (path) url.searchParams.set("next", path);
  return url.toString();
}

/** Where a redeemed link lands: the asked path of the studio, else its home. */
export function signedInUrl(config: LinkConfig, next: string | null | undefined) {
  return new URL(safeNextPath(next) ?? "/", config.appUrl).toString();
}

/** Where a dead link lands: the sign-in page, which says why. */
export function failedLinkUrl(config: LinkConfig) {
  return new URL("/login?error=link_invalid", config.appUrl).toString();
}
