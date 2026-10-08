import { describe, expect, it } from "vitest";
import { buildMagicLink, failedLinkUrl, safeNextPath, signedInUrl } from "./auth.links";

const config = { appUrl: "https://studio.example.com" };

describe("auth links", () => {
  it("keeps only paths of the studio", () => {
    expect(safeNextPath("/projects/1?tab=a")).toBe("/projects/1?tab=a");
    for (const unsafe of ["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/api/auth/logout", "", null]) {
      expect(safeNextPath(unsafe)).toBeNull();
    }
  });

  it("builds the e-mailed link on the studio's origin", () => {
    const link = new URL(buildMagicLink(config, "tok", "/templates"));
    expect(link.origin + link.pathname).toBe("https://studio.example.com/api/auth/passwordless/consume");
    expect(link.searchParams.get("token")).toBe("tok");
    expect(link.searchParams.get("next")).toBe("/templates");
    expect(new URL(buildMagicLink(config, "tok", "//evil")).searchParams.has("next")).toBe(false);
  });

  it("lands on the studio, or on the sign-in page when the link is dead", () => {
    expect(signedInUrl(config, "/assets")).toBe("https://studio.example.com/assets");
    expect(signedInUrl(config, undefined)).toBe("https://studio.example.com/");
    expect(failedLinkUrl(config)).toBe("https://studio.example.com/login?error=link_invalid");
  });
});
