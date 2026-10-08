import type { MailBlock } from "./mail-blocks";
import { MAIL_BRAND as B, MAIL_COLORS as C, MAIL_FONT, escapeHtml, mailLogoUrl } from "./mail-brand";
import type { MailConfig } from "./mail.config";

export type RenderedEmail = { html: string; text: string };

export type EmailContent = {
  /** Browser tab and `<title>`: usually the heading. */
  title: string;
  /** The grey line next to the subject in the inbox. */
  preheader: string;
  heading: string;
  blocks: MailBlock[];
  /** Why this person gets this e-mail, in one sentence. */
  reason: string;
};

export type MailBrandConfig = Pick<MailConfig, "appUrl" | "replyTo" | "supportEmail">;

/**
 * The shared frame of every Framesmith e-mail: logo and wordmark, a white card holding the message, then the
 * footer — why you get it, who to write to.
 *
 * Tables and inline styles only, 600 px wide: the markup Outlook and Gmail both draw the same way. The `<style>`
 * block is progressive: phone widths and dark mode where the client supports it, ignored elsewhere without harm.
 */
export function renderEmail(brand: MailBrandConfig, content: EmailContent): RenderedEmail {
  return { html: renderHtml(brand, content), text: renderText(brand, content) };
}

function renderHtml(brand: MailBrandConfig, content: EmailContent) {
  const app = escapeHtml(brand.appUrl);
  const link = `color:${C.muted};text-decoration:underline;`;
  const footerLine = `margin:0 0 8px;font-family:${MAIL_FONT};font-size:12px;line-height:1.5;color:${C.muted};`;
  const support = brand.supportEmail ? escapeHtml(brand.supportEmail) : null;

  return [
    `<!doctype html>`,
    `<html lang="fr"><head>`,
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<meta name="color-scheme" content="light dark" />`,
    `<meta name="supported-color-schemes" content="light dark" />`,
    `<title>${escapeHtml(content.title)}</title>`,
    `<style>`,
    `body{margin:0;padding:0;-webkit-text-size-adjust:100%;}`,
    `@media (max-width:620px){.fs-container{width:100%!important;}.fs-card{padding:28px 20px!important;}}`,
    `@media (prefers-color-scheme:dark){`,
    `.fs-body{background:${C.backgroundDark}!important;}`,
    `.fs-card{background:${C.cardDark}!important;border-color:${C.borderDark}!important;}`,
    `.fs-text{color:${C.textDark}!important;}`,
    `.fs-muted{color:${C.mutedDark}!important;}`,
    `.fs-accent{color:${C.primaryDark}!important;}`,
    `}`,
    `</style>`,
    `</head>`,
    `<body class="fs-body" style="margin:0;padding:0;background:${C.background};">`,
    // Preheader, padded so the inbox preview does not run into the body.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(content.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`,
    `<table role="presentation" class="fs-body" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.background}" style="background:${C.background};">`,
    `<tr><td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" class="fs-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">`,
    // Header: the mark as an image, the wordmark as text so it survives blocked images.
    `<tr><td style="padding:0 4px 20px;">`,
    `<a href="${app}" target="_blank" style="text-decoration:none;">`,
    `<img src="${escapeHtml(mailLogoUrl(brand.appUrl))}" width="32" height="32" alt="${B.name}" style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;" />`,
    `<span class="fs-text" style="display:inline-block;vertical-align:middle;padding-left:10px;font-family:${MAIL_FONT};font-size:20px;font-weight:600;letter-spacing:-0.01em;color:${C.text};">${B.lead}<span class="fs-accent" style="color:${C.primary};">${B.accent}</span></span>`,
    `</a></td></tr>`,
    // Card.
    `<tr><td class="fs-card" style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:40px;">`,
    `<h1 class="fs-text" style="margin:0 0 20px;font-family:${MAIL_FONT};font-size:24px;font-weight:600;line-height:1.3;color:${C.text};">${escapeHtml(content.heading)}</h1>`,
    ...content.blocks.map((block) => block.html),
    `<p class="fs-text" style="margin:8px 0 0;font-family:${MAIL_FONT};font-size:16px;line-height:1.6;color:${C.text};">L'équipe ${B.name}</p>`,
    `</td></tr>`,
    // Footer.
    `<tr><td class="fs-muted" style="padding:24px 8px 0;">`,
    `<p class="fs-text" style="margin:0 0 12px;font-family:${MAIL_FONT};font-size:13px;font-weight:500;line-height:1.5;color:${C.text};"><span style="color:${C.rec};">●</span>&nbsp;${escapeHtml(B.tagline)}</p>`,
    `<p class="fs-muted" style="${footerLine}">${escapeHtml(content.reason)}</p>`,
    support
      ? `<p class="fs-muted" style="${footerLine}">Une question ? ${brand.replyTo ? "Répondez à cet e-mail ou écrivez à" : "Écrivez-nous à"} <a href="mailto:${support}" style="${link}">${support}</a>.</p>`
      : "",
    `<p class="fs-muted" style="${footerLine}"><a href="${app}" style="${link}">${B.name}</a> · © ${new Date().getFullYear()}</p>`,
    `</td></tr>`,
    `</table>`,
    `</td></tr></table>`,
    `</body></html>`,
  ].join("");
}

function renderText(brand: MailBrandConfig, content: EmailContent) {
  return [
    B.name,
    "",
    content.heading,
    "",
    ...content.blocks.map((block) => block.text).filter((text) => text.length > 0).flatMap((text) => [text, ""]),
    `L'équipe ${B.name}`,
    "",
    "—",
    B.tagline,
    content.reason,
    ...(brand.supportEmail ? [`Une question ? ${brand.supportEmail}`] : []),
    brand.appUrl,
  ].join("\n");
}
