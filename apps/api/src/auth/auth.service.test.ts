import { describe, expect, it } from "vitest";
import { AuthService } from "./auth.service";
import type { AuthConfig } from "./auth.types";
import { InMemoryAccountStore } from "./testing/in-memory-account-store";

const config: AuthConfig = {
  appUrl: "http://127.0.0.1:4100",
  sessionTtlDays: 30,
  cookieName: "framesmith_session",
  sessionSecret: "test-secret",
  secureCookies: false,
  desktopLogin: { token: "launch-token", email: "studio@localhost" },
};

function setup(overrides: Partial<AuthConfig> = {}) {
  const store = new InMemoryAccountStore();
  return { store, auth: new AuthService({ ...config, ...overrides }, store) };
}

const header = (value: string) => `framesmith_session=${value}`;

describe("AuthService", () => {
  it("signs the app's person in with the launch token, created admin at the first launch", async () => {
    const { auth, store } = setup();
    const first = await auth.desktopSignIn("launch-token");
    const again = await auth.desktopSignIn("launch-token");
    expect(first.redirectUrl).toBe("http://127.0.0.1:4100/");
    expect(store.accounts.size).toBe(1);
    const user = await auth.authenticate(header(first.cookie.value));
    expect(user).toMatchObject({ email: "studio@localhost", role: "admin" });
    expect((await auth.authenticate(header(again.cookie.value)))?.id).toBe(user?.id);
  });

  it("refuses any other token, and every token when the app drew none", async () => {
    await expect(setup().auth.desktopSignIn("nope")).rejects.toThrow("invalide");
    await expect(setup().auth.desktopSignIn(undefined)).rejects.toThrow("invalide");
    await expect(setup({ desktopLogin: null }).auth.desktopSignIn("")).rejects.toThrow("invalide");
  });

  it("refuses a cookie signed with another secret, of a suspended account, or issued before a revocation", async () => {
    const { auth, store } = setup();
    const { cookie } = await auth.desktopSignIn("launch-token");
    const other = setup({ sessionSecret: "other" }).auth;
    expect(await other.authenticate(header(cookie.value))).toBeNull();

    const [account] = store.accounts.values();
    account.sessionsValidFrom = new Date(Date.now() + 1000);
    expect(await auth.authenticate(header(cookie.value))).toBeNull();
    account.sessionsValidFrom = null;
    account.status = "suspended";
    expect(await auth.authenticate(header(cookie.value))).toBeNull();
    await expect(auth.desktopSignIn("launch-token")).rejects.toThrow("suspendu");
  });
});
