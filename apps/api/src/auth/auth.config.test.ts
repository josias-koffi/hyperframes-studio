import { describe, expect, it } from "vitest";
import { resolveAuthConfig } from "./auth.config";

describe("resolveAuthConfig", () => {
  it("defaults for local development", () => {
    expect(resolveAuthConfig({ NODE_ENV: "development" })).toMatchObject({
      appUrl: "http://localhost:3010",
      magicLinkTtlMinutes: 15,
      sessionTtlDays: 7,
      cookieName: "framesmith_session",
      secureCookies: false,
    });
  });

  it("requires a secret in production and secures cookies on https", () => {
    expect(() => resolveAuthConfig({ NODE_ENV: "production" })).toThrow("AUTH_SESSION_SECRET");
    const config = resolveAuthConfig({ NODE_ENV: "production", AUTH_SESSION_SECRET: "s", WEB_URL: "https://studio.example.com/" });
    expect(config).toMatchObject({ appUrl: "https://studio.example.com", secureCookies: true, sessionSecret: "s" });
  });

  it("ignores durations that are not positive integers", () => {
    expect(resolveAuthConfig({ AUTH_MAGIC_LINK_TTL_MINUTES: "-3", AUTH_SESSION_TTL_DAYS: "30" })).toMatchObject({
      magicLinkTtlMinutes: 15,
      sessionTtlDays: 30,
    });
  });
});
