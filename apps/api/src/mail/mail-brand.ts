/**
 * The Framesmith identity as an e-mail client can take it: hex colours inline (no CSS variables), a system font
 * stack (no web font), a PNG logo (Gmail shows no SVG). Values from the web app (`globals.css`, `app/icon.svg`).
 */
export const MAIL_COLORS = {
  primary: "#5B4BFF",
  primaryDark: "#8F84FF",
  rec: "#F2603F",
  background: "#F6F6FB",
  backgroundDark: "#0E0F1A",
  card: "#FFFFFF",
  cardDark: "#171827",
  border: "#E4E4EF",
  borderDark: "#2A2B40",
  text: "#14152B",
  textDark: "#F2F2F8",
  muted: "#6B6C80",
  mutedDark: "#A0A1B5",
} as const;

export const MAIL_FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const MAIL_BRAND = { name: "Framesmith", lead: "Frame", accent: "smith", tagline: "Studio vidéo HyperFrames" } as const;

/** Served by the web app (`apps/web/public/email/`). */
export function mailLogoUrl(appUrl: string) {
  return `${appUrl}/email/logo.png`;
}

/** Escapes everything that is not ours, URLs included since they land in attributes. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** « 8 octobre 2026 à 14:32 », Paris time: what the reader's clock says. */
export function formatParisDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}
