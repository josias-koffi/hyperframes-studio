import type { AuthConfig } from "./auth.types";

const DEFAULT_APP_URL = "http://localhost:3010";
const DEFAULT_DEV_SECRET = "framesmith-dev-session-secret-change-me";

function positiveInt(raw: string | undefined, fallback: number) {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function resolveAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const appUrl = new URL(env.WEB_URL?.trim() || DEFAULT_APP_URL).toString().replace(/\/$/, "");
  const sessionSecret = env.AUTH_SESSION_SECRET?.trim() || (env.NODE_ENV === "production" ? "" : DEFAULT_DEV_SECRET);
  if (!sessionSecret) throw new Error("AUTH_SESSION_SECRET is required in production to sign sessions.");
  const token = env.DESKTOP_LOGIN_TOKEN?.trim();
  return {
    appUrl,
    sessionTtlDays: positiveInt(env.AUTH_SESSION_TTL_DAYS, 30),
    cookieName: env.AUTH_COOKIE_NAME?.trim() || "framesmith_session",
    sessionSecret,
    secureCookies: appUrl.startsWith("https://"),
    desktopLogin: token ? { token, email: env.DESKTOP_USER_EMAIL?.trim() || "studio@localhost" } : null,
  };
}
