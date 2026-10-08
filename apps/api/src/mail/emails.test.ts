import { describe, expect, it } from "vitest";
import { composeMagicLinkEmail } from "./emails";
import { resolveMailConfig } from "./mail.config";

const brand = resolveMailConfig({ WEB_URL: "https://studio.example.com", EMAIL_REPLY_TO: "Framesmith <support@example.com>" });

describe("composeMagicLinkEmail", () => {
  const email = composeMagicLinkEmail(brand, {
    expiresAt: "2026-10-08T12:15:00.000Z",
    magicLink: "https://studio.example.com/api/auth/passwordless/consume?token=a&next=/x",
    sessionDurationDays: 7,
  });

  it("carries the brand, the button and the expiry in Paris time", () => {
    expect(email.subject).toBe("Votre lien de connexion Framesmith");
    expect(email.html).toContain("https://studio.example.com/email/logo.png");
    expect(email.html).toContain("Me connecter");
    expect(email.html).toContain("8 octobre 2026 à 14:15");
    expect(email.html).toContain("mailto:support@example.com");
  });

  it("escapes the link in the HTML and keeps it whole in the text part", () => {
    expect(email.html).toContain("token=a&amp;next=/x");
    expect(email.text).toContain("Me connecter : https://studio.example.com/api/auth/passwordless/consume?token=a&next=/x");
    expect(email.text).toContain("7 jours");
  });
});
