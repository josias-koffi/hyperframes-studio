export const MAIL_CONFIG = Symbol("MAIL_CONFIG");

const DEFAULT_APP_URL = "http://localhost:3010";

/** What every e-mail needs besides its own content: who sends it, where a reply lands, the app it links to. */
export type MailConfig = {
  /** `EMAIL_FROM`, name and address together. Null: nothing can be sent. */
  from: string | null;
  /** `EMAIL_REPLY_TO`: a reply to no-reply@ reaches a person instead. */
  replyTo: string | null;
  /** `WEB_URL`: the studio serves the logo, and every link of an e-mail opens it. */
  appUrl: string;
  /** The address the footer names, the same as the reply-to. Null: the footer names none. */
  supportEmail: string | null;
};

function readOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveMailConfig(env: NodeJS.ProcessEnv): MailConfig {
  const replyTo = readOptional(env.EMAIL_REPLY_TO);
  const appUrl = readOptional(env.WEB_URL);
  return {
    appUrl: appUrl ? new URL(appUrl).toString().replace(/\/$/, "") : DEFAULT_APP_URL,
    from: readOptional(env.EMAIL_FROM),
    replyTo,
    supportEmail: replyTo ? extractAddress(replyTo) : null,
  };
}

/** `Framesmith <support@x>` → `support@x`; a bare address is returned as is. */
function extractAddress(value: string) {
  return /<([^>]+)>/.exec(value)?.[1]?.trim() ?? value;
}
