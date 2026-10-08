import { describe, expect, it } from "vitest";
import { createSmtpConfig } from "./smtp.config";

describe("createSmtpConfig", () => {
  it("is off when nothing is set", () => {
    expect(createSmtpConfig({}).enabled).toBe(false);
  });

  it("reads a complete configuration", () => {
    const config = createSmtpConfig({ SMTP_PROVIDER: "resend", SMTP_SERVER: "smtp.resend.com", SMTP_PORT: "587", SMTP_USER: "resend", SMTP_PASSWORD: "pw" });
    expect(config).toEqual({ enabled: true, provider: "resend", server: "smtp.resend.com", port: 587, user: "resend", password: "pw" });
  });

  it("refuses half a configuration and a bad port", () => {
    expect(() => createSmtpConfig({ SMTP_SERVER: "smtp.resend.com" })).toThrow("Missing: SMTP_PORT, SMTP_USER, SMTP_PASSWORD");
    expect(() => createSmtpConfig({ SMTP_SERVER: "h", SMTP_PORT: "x", SMTP_USER: "u", SMTP_PASSWORD: "p" })).toThrow("SMTP_PORT");
  });
});
