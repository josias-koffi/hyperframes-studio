import { describe, expect, it } from "vitest";
import { resolveAuthConfig } from "./auth.config";

describe("resolveAuthConfig", () => {
  it("defaults for local development, where nobody can sign in without a launch token", () => {
    expect(resolveAuthConfig({ NODE_ENV: "development" })).toMatchObject({
      appUrl: "http://localhost:3010",
      sessionTtlDays: 30,
      cookieName: "framesmith_session",
      secureCookies: false,
      desktopLogin: null,
    });
  });

  it("requires a secret in production", () => {
    expect(() => resolveAuthConfig({ NODE_ENV: "production" })).toThrow("AUTH_SESSION_SECRET");
    const config = resolveAuthConfig({ NODE_ENV: "production", AUTH_SESSION_SECRET: "s", WEB_URL: "http://127.0.0.1:4100/" });
    expect(config).toMatchObject({ appUrl: "http://127.0.0.1:4100", secureCookies: false, sessionSecret: "s" });
  });

  it("signs in the launch token's person, studio@localhost unless DESKTOP_USER_EMAIL says otherwise", () => {
    expect(resolveAuthConfig({ DESKTOP_LOGIN_TOKEN: " t " }).desktopLogin).toEqual({ token: "t", email: "studio@localhost" });
    expect(resolveAuthConfig({ DESKTOP_LOGIN_TOKEN: "t", DESKTOP_USER_EMAIL: "ada@example.com" }).desktopLogin?.email).toBe("ada@example.com");
  });

  it("ignores durations that are not positive integers", () => {
    expect(resolveAuthConfig({ AUTH_SESSION_TTL_DAYS: "-3" }).sessionTtlDays).toBe(30);
    expect(resolveAuthConfig({ AUTH_SESSION_TTL_DAYS: "7" }).sessionTtlDays).toBe(7);
  });
});
