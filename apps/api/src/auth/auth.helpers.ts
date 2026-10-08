import { createHash } from "node:crypto";
import type { UserConsent } from "@studio/db";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSENT_VERSION = "2026-10-studio";

/** Lowercased and trimmed, or null when it is not an address. */
export function normalizeEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** Tokens are stored hashed: a leaked table cannot be replayed as links. */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createConsentRecord(): UserConsent {
  return { acceptedAt: new Date().toISOString(), source: "passwordless", version: CONSENT_VERSION };
}
