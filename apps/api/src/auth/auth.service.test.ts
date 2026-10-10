import { describe, expect, it } from "vitest";
import { hashToken } from "./auth.helpers";
import { AuthService } from "./auth.service";
import type { AuthConfig } from "./auth.types";
import { InMemoryAccountStore } from "./testing/in-memory-account-store";

const config: AuthConfig = {
  appUrl: "https://studio.example.com",
  magicLinkTtlMinutes: 15,
  sessionTtlDays: 7,
  cookieName: "framesmith_session",
  sessionSecret: "test-secret",
  secureCookies: true,
};

function setup() {
  const store = new InMemoryAccountStore();
  return { store, auth: new AuthService(config, store) };
}

function tokenOf(magicLink: string) {
  return new URL(magicLink).searchParams.get("token")!;
}

async function signIn(auth: AuthService, email: string) {
  const { magicLink } = await auth.requestMagicLink(email, true);
  return auth.consumeMagicLink(tokenOf(magicLink));
}

describe("AuthService", () => {
  it("sends a link through the studio's /api and stores only its hash", async () => {
    const { auth, store } = setup();
    const result = await auth.requestMagicLink("  Ada@Example.com ", true);
    expect(result.email).toBe("ada@example.com");
    expect(result.magicLink.startsWith("https://studio.example.com/api/auth/passwordless/consume?token=")).toBe(true);
    const token = tokenOf(result.magicLink);
    expect(store.links.has(token)).toBe(false);
    expect(store.links.has(hashToken(token))).toBe(true);
  });

  it("refuses an invalid address and a new account without consent", async () => {
    const { auth } = setup();
    await expect(auth.requestMagicLink("not-an-email", true)).rejects.toThrow("adresse e-mail valide");
    await expect(auth.requestMagicLink("ada@example.com", false)).rejects.toThrow("Accepte les conditions");
  });

  it("lets an existing account sign in again without the consent box", async () => {
    const { auth } = setup();
    await signIn(auth, "ada@example.com");
    await expect(auth.requestMagicLink("ada@example.com", false)).resolves.toMatchObject({ email: "ada@example.com" });
  });

  it("creates the account on the first redeemed link, the first one as admin", async () => {
    const { auth, store } = setup();
    const first = await signIn(auth, "ada@example.com");
    const second = await signIn(auth, "bob@example.com");
    expect(first.session.role).toBe("admin");
    expect(second.session.role).toBe("user");
    expect(store.accounts.size).toBe(2);
    expect(first.redirectUrl).toBe("https://studio.example.com/");
    expect(first.cookie.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  });

  it("redeems a link once only", async () => {
    const { auth } = setup();
    const { magicLink } = await auth.requestMagicLink("ada@example.com", true);
    await auth.consumeMagicLink(tokenOf(magicLink));
    await expect(auth.consumeMagicLink(tokenOf(magicLink))).rejects.toThrow("invalide ou a expiré");
  });

  it("refuses an expired link", async () => {
    const { auth, store } = setup();
    const { magicLink } = await auth.requestMagicLink("ada@example.com", true);
    store.links.get(hashToken(tokenOf(magicLink)))!.expiresAt = new Date(Date.now() - 1000);
    await expect(auth.consumeMagicLink(tokenOf(magicLink))).rejects.toThrow("invalide ou a expiré");
  });

  it("opens the asked path of the studio, never another origin", async () => {
    const { auth } = setup();
    const inside = await auth.requestMagicLink("ada@example.com", true, "/projects/42");
    expect((await auth.consumeMagicLink(tokenOf(inside.magicLink), "/projects/42")).redirectUrl).toBe("https://studio.example.com/projects/42");
    const outside = await auth.requestMagicLink("ada@example.com", true);
    expect((await auth.consumeMagicLink(tokenOf(outside.magicLink), "//evil.example")).redirectUrl).toBe("https://studio.example.com/");
  });

  it("authenticates the cookie it minted, and nothing else", async () => {
    const { auth } = setup();
    const { cookie, session } = await signIn(auth, "ada@example.com");
    const header = `other=1; ${cookie.name}=${cookie.value}`;
    expect(await auth.authenticate(header)).toEqual({ id: session.userId, email: "ada@example.com", role: "admin" });
    const [payload] = cookie.value.split(".");
    expect(await auth.authenticate(`${cookie.name}=${payload}.forged`)).toBeNull();
    expect(await auth.authenticate(undefined)).toBeNull();
  });

  it("lets a valid cookie win over a stale one of the same name", async () => {
    const { auth } = setup();
    const { cookie } = await signIn(auth, "ada@example.com");
    expect(await auth.authenticate(`${cookie.name}=stale.value; ${cookie.name}=${cookie.value}`)).not.toBeNull();
  });

  it("refuses the sessions of a suspended account or issued before a revocation", async () => {
    const { auth, store } = setup();
    const { cookie, session } = await signIn(auth, "ada@example.com");
    const header = `${cookie.name}=${cookie.value}`;
    const account = store.accounts.get(session.userId)!;

    account.sessionsValidFrom = new Date(Date.now() + 1000);
    expect(await auth.authenticate(header)).toBeNull();

    account.sessionsValidFrom = null;
    account.status = "suspended";
    expect(await auth.authenticate(header)).toBeNull();
    await expect(auth.requestMagicLink("ada@example.com", true)).rejects.toThrow("suspendu");
  });

  it("clears the cookie on logout", () => {
    const { auth } = setup();
    expect(auth.clearSessionCookie()).toMatchObject({ name: "framesmith_session", value: "", options: { maxAge: 0 } });
  });

  it("signs the desktop app's one person in with its launch token, and refuses any other", async () => {
    const store = new InMemoryAccountStore();
    const auth = new AuthService({ ...config, desktopLogin: { token: "launch-token", email: "studio@localhost" } }, store);
    await expect(auth.desktopSignIn("nope")).rejects.toThrow("invalide");
    await expect(auth.desktopSignIn(undefined)).rejects.toThrow("invalide");
    const first = await auth.desktopSignIn("launch-token");
    const again = await auth.desktopSignIn("launch-token");
    expect(first.redirectUrl).toBe("https://studio.example.com/");
    expect(await auth.authenticate(`framesmith_session=${first.cookie.value}`)).toMatchObject({ email: "studio@localhost", role: "admin" });
    expect((await auth.authenticate(`framesmith_session=${again.cookie.value}`))?.id).toBe((await auth.authenticate(`framesmith_session=${first.cookie.value}`))?.id);
  });

  it("has no desktop sign-in on the servers", async () => {
    const { auth } = setup();
    await expect(auth.desktopSignIn("")).rejects.toThrow("invalide");
  });
});
