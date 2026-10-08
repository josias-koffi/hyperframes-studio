import { MAIL_COLORS as C, MAIL_FONT, escapeHtml } from "./mail-brand";

/**
 * One piece of an e-mail, written once for both parts of the message: the HTML most clients show, and the plain
 * text the others (and spam filters) read. An empty `text` leaves the block out of the plain version.
 */
export type MailBlock = { html: string; text: string };

/** Plain text, or a run the reader's eye should catch. Always escaped. */
export type MailSegment = string | { strong: string };

export function strong(value: string): MailSegment {
  return { strong: value };
}

function segmentsHtml(segments: MailSegment[]) {
  return segments
    .map((segment) => (typeof segment === "string" ? escapeHtml(segment) : `<strong style="font-weight:600;">${escapeHtml(segment.strong)}</strong>`))
    .join("");
}

function segmentsText(segments: MailSegment[]) {
  return segments.map((segment) => (typeof segment === "string" ? segment : segment.strong)).join("");
}

const BODY_STYLE = `margin:0 0 16px;font-family:${MAIL_FONT};font-size:16px;line-height:1.6;color:${C.text};`;
const SMALL_STYLE = `margin:0 0 16px;font-family:${MAIL_FONT};font-size:13px;line-height:1.5;color:${C.muted};`;

export function paragraph(...segments: MailSegment[]): MailBlock {
  return { html: `<p class="fs-text" style="${BODY_STYLE}">${segmentsHtml(segments)}</p>`, text: segmentsText(segments) };
}

/** Secondary information: security notes, footnotes. */
export function note(...segments: MailSegment[]): MailBlock {
  return { html: `<p class="fs-muted" style="${SMALL_STYLE}">${segmentsHtml(segments)}</p>`, text: segmentsText(segments) };
}

/** The one action of the e-mail. A padded link inside a table cell, so Outlook draws the whole button clickable. */
export function button(label: string, url: string): MailBlock {
  const href = escapeHtml(url);
  return {
    html:
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">` +
      `<tr><td align="center" bgcolor="${C.primary}" style="border-radius:10px;background:${C.primary};">` +
      `<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${MAIL_FONT};font-size:16px;font-weight:600;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>` +
      `</td></tr></table>`,
    text: `${label} : ${url}`,
  };
}

/** The raw link under a button, for clients that break buttons. */
export function fallbackLink(url: string): MailBlock {
  const href = escapeHtml(url);
  return {
    html:
      `<p class="fs-muted" style="${SMALL_STYLE}word-break:break-all;">` +
      `Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br />` +
      `<a class="fs-accent" href="${href}" style="color:${C.primary};">${href}</a></p>`,
    // The button's own text line already carries the URL.
    text: "",
  };
}
