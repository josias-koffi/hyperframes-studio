import nodemailer from "nodemailer";
import type { SmtpConfig } from "./smtp.config";

export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");

export type MailMessage = { from: string; to: string; replyTo?: string; subject: string; html: string; text: string };

export type MailTransport = { sendMail: (message: MailMessage) => Promise<unknown> };

/** One SMTP connection for every mailer; null while SMTP is off. */
export function createMailTransport(smtp: SmtpConfig): MailTransport | null {
  if (!smtp.enabled) return null;
  return nodemailer.createTransport({
    auth: { user: smtp.user ?? undefined, pass: smtp.password ?? undefined },
    host: smtp.server ?? undefined,
    port: smtp.port ?? undefined,
    secure: smtp.port === 465,
  });
}

export function toMailMessage(
  sender: { from: string; replyTo: string | null },
  to: string,
  email: { subject: string; html: string; text: string },
): MailMessage {
  return { from: sender.from, to, ...(sender.replyTo ? { replyTo: sender.replyTo } : {}), subject: email.subject, html: email.html, text: email.text };
}
